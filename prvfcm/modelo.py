"""
Modelo PRV-FCM persistente en JSON.

``guardar_modelo`` escribe el esquema, el preprocesador ajustado, el FCM y la
configuración del AG. ``ModeloPRVFCM`` los recupera, describe el mapa (conceptos,
aristas, acciones) y traduce entre unidades originales y activaciones en [0, 1].
Las consultas en tiempo real (inferencia paso a paso, simulación y prescripción
con el AG) están en :mod:`prvfcm.api`: ``PredictorFCM`` y ``PrescriptorAG``.
"""
from __future__ import annotations

import dataclasses
import json
from pathlib import Path

import numpy as np
import pandas as pd

from .configuracion import ConfigAG, ConfigFCM, ConfigPrescripcion
from .esquema import codificacion_de, esquema_a_dict, esquema_desde_dict, rol_de, segmento_desde_dict
from .evaluacion import discretizar_rendimiento
from .fcm import MapaCognitivoDifuso
from .pipeline import ResultadoPipeline
from .preprocesamiento import Preprocesador, como_texto

VERSION = 1


def guardar_modelo(r: ResultadoPipeline, ruta: Path) -> None:
    """Guarda lo necesario para inferir y prescribir sin volver a entrenar."""
    datos = {
        "version": VERSION,
        "esquema": esquema_a_dict(r.esquema, r.opciones.segmento),
        "preprocesador": r.pre.a_dict(),
        "fcm": {
            "nombres": r.fcm.nombres,
            "estructura": r.fcm.estructura.astype(int).tolist(),
            "pesos": r.fcm.pesos.tolist(),
            "indices_fijos": r.fcm.indices_fijos.tolist(),
            "config": dataclasses.asdict(r.config_fcm),
        },
        "medias_dinamicos": r.medias_dinamicos.tolist(),
        "config_ag": dataclasses.asdict(r.opciones.config_ag),
        "config_prescripcion": dataclasses.asdict(r.config_prescripcion),
        "ids_prueba": [int(i) for i in r.prueba.index],
        "semilla": r.opciones.semilla,
    }
    ruta.write_text(json.dumps(datos, ensure_ascii=False), encoding="utf-8")


class ModeloPRVFCM:
    """FCM entrenado con su preprocesador: lo que necesitan ``PredictorFCM`` y ``PrescriptorAG``."""

    def __init__(self, datos: dict):
        if datos.get("version") != VERSION:
            raise ValueError("El modelo se guardó con otra versión; vuelva a entrenarlo.")
        self.esquema = esquema_desde_dict(datos["esquema"])
        self.segmento = segmento_desde_dict(datos["esquema"].get("segmento"))
        self.pre = Preprocesador.desde_dict(datos["preprocesador"], self.esquema)
        f = datos["fcm"]
        self.fcm = MapaCognitivoDifuso(
            np.array(f["estructura"], dtype=bool), np.array(f["indices_fijos"], dtype=int), ConfigFCM(**f["config"]), f["nombres"]
        )
        self.fcm.pesos = np.array(f["pesos"], dtype=float)
        self.medias_dinamicos = np.array(datos["medias_dinamicos"], dtype=float)
        self.config_ag = ConfigAG(**datos["config_ag"])
        presc = dict(datos["config_prescripcion"])
        presc["clases_a_prescribir"] = tuple(presc["clases_a_prescribir"])
        self.config_prescripcion = ConfigPrescripcion(**presc)
        self.ids_prueba = set(datos.get("ids_prueba", []))
        self.semilla = int(datos.get("semilla", 42))

    @classmethod
    def cargar(cls, ruta: str | Path) -> "ModeloPRVFCM":
        return cls(json.loads(Path(ruta).read_text(encoding="utf-8")))

    # ------------------------------------------------------------------
    # Descripción del modelo
    # ------------------------------------------------------------------
    def conceptos(self) -> list[dict]:
        return [
            {
                "id": c.id,
                "columna": c.columna,
                "nombre": c.nombre,
                "rol": rol_de(self.esquema, c),
                "dinamico": bool(c.dinamico),
                "codificacion": codificacion_de(self.esquema, c.columna),
            }
            for c in self.esquema.conceptos
        ]

    def aristas(self) -> list[dict]:
        """Pesos aprendidos: una arista por relación permitida en la estructura."""
        nombres = self.fcm.nombres
        return [
            {"origen": nombres[j], "destino": nombres[i], "peso": float(self.fcm.pesos[j, i])}
            for j, i in zip(*np.nonzero(self.fcm.estructura))
        ]

    def influencias(self) -> list[dict]:
        """Pesos hacia el objetivo, del más fuerte al más débil."""
        objetivo = self.pre.indice_objetivo
        conceptos = self.conceptos()
        filas = [
            {**conceptos[j], "peso": float(self.fcm.pesos[j, objetivo])}
            for j in np.flatnonzero(self.fcm.estructura[:, objetivo])
        ]
        return sorted(filas, key=lambda f: -abs(f["peso"]))

    def acciones(self) -> list[dict]:
        """Rango y codificación de cada acción, para los controles de simulación."""
        salida = []
        for i in self.pre.indices_accion:
            c = self.esquema.conceptos[i]
            info = {
                "id": c.id,
                "columna": c.columna,
                "nombre": c.nombre,
                "codificacion": codificacion_de(self.esquema, c.columna),
                "min": float(self.pre.minimos[c.columna]),
                "max": float(self.pre.maximos[c.columna]),
            }
            if c.columna in self.esquema.codificacion_ordinal:
                mapa = self.esquema.codificacion_ordinal[c.columna]
                info["categorias"] = sorted(mapa, key=mapa.get)
            salida.append(info)
        return salida

    # ------------------------------------------------------------------
    # Estados y unidades
    # ------------------------------------------------------------------
    def estado(self, registro: pd.DataFrame) -> np.ndarray:
        """Activaciones normalizadas de un registro (DataFrame de una fila)."""
        return self.pre.transformar(registro)[0]

    def valor_normalizado(self, columna: str, valor) -> float:
        """Lleva un valor en unidades originales (o una categoría ordinal) a [0, 1]."""
        mapa = self.esquema.codificacion_ordinal.get(columna)
        if mapa is not None and not isinstance(valor, (int, float)):
            texto = como_texto(pd.Series([valor])).iloc[0]
            if texto not in mapa:
                raise ValueError(f"{columna}: la categoría {valor} no está en el orden del esquema.")
            valor = mapa[texto]
        return float(self.pre.normalizar(float(valor), columna))

    def valor_original(self, columna: str, normalizado: float) -> dict:
        """Valor en unidades originales y, si la columna es ordinal, la categoría más cercana."""
        valor = float(self.pre.desnormalizar(normalizado, columna))
        salida = {"valor": valor}
        mapa = self.esquema.codificacion_ordinal.get(columna)
        if mapa is not None:
            salida["categoria"] = min(mapa, key=lambda k: abs(mapa[k] - valor))
        return salida

    def describir(self, estado: np.ndarray, meta: float = 1.0) -> dict:
        """Estado de convergencia del FCM partiendo de ``estado`` (ver :meth:`describir_final`)."""
        return self.describir_final(self.fcm.inferir(estado).estados, meta)

    def describir_final(self, final: np.ndarray, meta: float = 1.0) -> dict:
        """Activación y nivel del objetivo en un estado ya convergido.

        ``exito`` indica si el objetivo queda a menos de la tolerancia de la
        meta (por defecto 1, el mejor nivel).
        """
        objetivo = self.pre.indice_objetivo
        activacion = float(final[objetivo])
        return {
            "activacion": activacion,
            "nivel": discretizar_rendimiento(activacion, self.esquema.niveles).item(),
            "exito": bool(abs(activacion - meta) <= self.config_prescripcion.tolerancia_exito + 1e-9),
            "dinamicos": {self.pre.columnas[i]: float(final[i]) for i in self.pre.indices_dinamicos},
        }

    def meta(self, nivel: str | None = None) -> dict:
        """Estado deseado del objetivo: el valor normalizado de ``nivel`` (por defecto el mejor, 1)."""
        if nivel is not None and nivel not in self.esquema.niveles:
            raise ValueError(f"El nivel {nivel} no existe; use uno de {', '.join(self.esquema.niveles)}.")
        valor = float(self.esquema.niveles[nivel]) if nivel is not None else 1.0
        return {
            "valor": valor,
            "nivel": discretizar_rendimiento(valor, self.esquema.niveles).item(),
            "tolerancia": float(self.config_prescripcion.tolerancia_exito),
        }

    def contribuciones(self, estado_base: np.ndarray, estado_prescrito: np.ndarray) -> list[dict]:
        """Aporte k1 * w_jo * A_j de cada concepto a la entrada del objetivo, antes y después de prescribir."""
        objetivo = self.pre.indice_objetivo
        k1 = self.fcm.config.coef_influencia
        filas = []
        for j in np.flatnonzero(self.fcm.estructura[:, objetivo]):
            c = self.esquema.conceptos[j]
            peso = float(self.fcm.pesos[j, objetivo])
            filas.append(
                {
                    "id": c.id,
                    "columna": c.columna,
                    "nombre": c.nombre,
                    "rol": rol_de(self.esquema, c),
                    "peso": peso,
                    "activacion_base": float(estado_base[j]),
                    "activacion_prescrita": float(estado_prescrito[j]),
                    "aporte_base": k1 * peso * float(estado_base[j]),
                    "aporte_prescrito": k1 * peso * float(estado_prescrito[j]),
                }
            )
        return sorted(filas, key=lambda f: -abs(f["aporte_prescrito"]))

    # ------------------------------------------------------------------
    # Perfil de riesgo escrito a mano
    # ------------------------------------------------------------------
    def registro_de_perfil(self, perfil: dict) -> pd.DataFrame:
        """Registro de una fila con los valores del perfil (unidades originales o categorías).

        Hacen falta todas las columnas que usan los conceptos, salvo el objetivo:
        es el concepto que el FCM infiere, así que su valor inicial no importa.
        """
        objetivo = self.esquema.objetivo
        faltantes = [c for c in self.esquema.columnas_origen if c != objetivo and perfil.get(c) in (None, "")]
        if faltantes:
            raise ValueError(f"Faltan valores del perfil: {', '.join(faltantes)}.")
        fila = {}
        for columna in self.esquema.columnas_origen:
            if columna == objetivo:
                mapa = self.esquema.codificacion_ordinal.get(objetivo)
                fila[columna] = next(iter(mapa)) if mapa else 0.0
                continue
            valor = perfil[columna]
            if codificacion_de(self.esquema, columna) == "numerica":
                try:
                    valor = float(valor)
                except (TypeError, ValueError):
                    raise ValueError(f"{columna}: el valor «{valor}» no es un número.") from None
            fila[columna] = valor
        return pd.DataFrame([fila])

    def estado_de_perfil(self, perfil: dict) -> np.ndarray:
        """Activaciones normalizadas del perfil; los conceptos dinámicos parten de su valor neutro."""
        estado = self.estado(self.registro_de_perfil(perfil))
        estado[self.pre.indices_dinamicos] = self.medias_dinamicos
        return estado
