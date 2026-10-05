"""
Gráficas de resultados (PNG estáticos con matplotlib).

* Selección de hiperparámetros: exactitud de validación cruzada frente a lambda.
* Mapa cognitivo como grafo dirigido (NetworkX): el grosor de cada arista es
  |w_ji| y el color su signo.
* Convergencia del AG: mediana y rango intercuartílico del mejor costo.
* Objetivo antes y después de la prescripción, por registro.
* Matriz de pesos causales aprendida (hacia los conceptos dinámicos).
* Nivel medio de cada acción: actual frente a recomendado (unidades originales).

``generar_figuras`` produce todas a partir de un ``ResultadoPipeline``; la usan
``main.py`` y el entrenamiento de la aplicación web.
"""
from __future__ import annotations

from pathlib import Path
from typing import TYPE_CHECKING

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import networkx as nx  # noqa: E402
import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402
from matplotlib.colors import LinearSegmentedColormap  # noqa: E402
from matplotlib.lines import Line2D  # noqa: E402

from .prescripcion import ResultadoPrescripcion  # noqa: E402

if TYPE_CHECKING:
    from .pipeline import ResultadoPipeline

# Paleta: superficie clara, tinta en tres niveles y dos series categóricas.
SUPERFICIE = "#fcfcfb"
TINTA = "#0b0b0b"
TINTA_SECUNDARIA = "#52514e"
TINTA_TENUE = "#898781"
CUADRICULA = "#e1e0d9"
EJE = "#c3c2b7"
SERIE_1 = "#2a78d6"  # Acciones actuales / serie principal.
SERIE_2 = "#eb6834"  # Acciones prescritas.
NEGATIVO = "#e34948"
NEUTRO = "#f0efec"
PIZARRA = "#203b34"  # Concepto objetivo (color de la aplicación).
DIVERGENTE = LinearSegmentedColormap.from_list("divergente", [NEGATIVO, NEUTRO, SERIE_1])

# Por encima de este número de estudiantes, antes/después se dibuja sin conectores.
MAX_PARES_VISIBLES = 150


def _estilo() -> None:
    plt.rcParams.update(
        {
            "font.family": "sans-serif",
            "font.sans-serif": ["Segoe UI", "Helvetica", "Arial", "DejaVu Sans"],
            "font.size": 10,
            "figure.facecolor": SUPERFICIE,
            "axes.facecolor": SUPERFICIE,
            "axes.edgecolor": EJE,
            "axes.linewidth": 1.0,
            "axes.labelcolor": TINTA_SECUNDARIA,
            "axes.titlecolor": TINTA,
            "axes.titlesize": 12,
            "axes.titlelocation": "left",
            "axes.spines.top": False,
            "axes.spines.right": False,
            "xtick.color": TINTA_TENUE,
            "ytick.color": TINTA_TENUE,
            "xtick.labelcolor": TINTA_SECUNDARIA,
            "ytick.labelcolor": TINTA_SECUNDARIA,
            "grid.color": CUADRICULA,
            "grid.linewidth": 0.8,
            "grid.linestyle": "-",
            "legend.frameon": False,
            "legend.labelcolor": TINTA_SECUNDARIA,
            "savefig.facecolor": SUPERFICIE,
            "savefig.dpi": 150,
            "savefig.bbox": "tight",
        }
    )


def grafica_seleccion(
    tabla: pd.DataFrame,
    lambda_elegido: float,
    alpha_elegido: float,
    ruta: Path,
    exactitud_mayoritaria: float | None = None,
    lambda_articulo: float | None = None,
) -> None:
    """Exactitud de validación cruzada frente a lambda: el alpha elegido resaltado, el resto en gris."""
    _estilo()
    fig, ax = plt.subplots(figsize=(7.5, 4.4))
    lambdas = np.sort(tabla["lambda"].unique())
    es_elegido = np.isclose(tabla["alpha_l2"], alpha_elegido)

    otros = sorted(tabla.loc[~es_elegido, "alpha_l2"].unique())
    for k, alpha in enumerate(otros):
        grupo = tabla[np.isclose(tabla["alpha_l2"], alpha)].sort_values("lambda")
        etiqueta = f"Otros α ({', '.join(f'{a:g}' for a in otros)})" if k == 0 else None
        ax.plot(grupo["lambda"], 100 * grupo["exactitud"], color=EJE, linewidth=1.5, zorder=1, label=etiqueta)

    elegido = tabla[es_elegido].sort_values("lambda")
    media = 100 * elegido["exactitud"].to_numpy()
    desviacion = 100 * elegido["exactitud_de"].fillna(0.0).to_numpy()
    ax.fill_between(elegido["lambda"], media - desviacion, media + desviacion, color=SERIE_1, alpha=0.12, linewidth=0)
    ax.plot(
        elegido["lambda"], media, color=SERIE_1, linewidth=2, marker="o", markersize=6,
        markeredgecolor=SUPERFICIE, markeredgewidth=1.5, zorder=3, label=f"α = {alpha_elegido:g} (± 1 desviación estándar)",
    )

    def marcar(lambda_: float, texto: str, desplazamiento: tuple[int, int]) -> None:
        y = media[np.isclose(elegido["lambda"], lambda_)]
        if y.size:
            ax.scatter([lambda_], y[:1], s=170, facecolor="none", edgecolor=TINTA, linewidth=1.2, zorder=4)
            ax.annotate(texto.format(y=y[0]), xy=(lambda_, y[0]), xytext=desplazamiento, textcoords="offset points",
                        ha="center", color=TINTA, fontsize=9)

    marcar(lambda_elegido, f"elegido: λ = {lambda_elegido:g} ({{y:.1f}} %)", (0, 12))
    if lambda_articulo is not None and not np.isclose(lambda_articulo, lambda_elegido):
        marcar(lambda_articulo, f"λ = {lambda_articulo:g} del artículo ({{y:.1f}} %)", (-30, -22))
    if exactitud_mayoritaria is not None:
        ax.axhline(100 * exactitud_mayoritaria, color=TINTA_TENUE, linewidth=1, zorder=0)
        ax.text(lambdas[0], 100 * exactitud_mayoritaria - 1.5, f"clase mayoritaria ({100 * exactitud_mayoritaria:.0f} %)",
                va="top", ha="left", color=TINTA_SECUNDARIA, fontsize=9)

    ax.set_xscale("log")
    ax.set_xticks(lambdas, [f"{v:g}" for v in lambdas])
    ax.minorticks_off()
    ax.set_ylim(0, 100)
    ax.set_title("Selección de hiperparámetros del FCM (validación cruzada agrupada)")
    ax.set_xlabel("Pendiente λ de la sigmoide (escala logarítmica)")
    ax.set_ylabel("Exactitud media en validación (%)")
    ax.grid(axis="y")
    ax.set_axisbelow(True)
    ax.legend(loc="upper left", ncols=2, bbox_to_anchor=(0, -0.16))
    fig.savefig(ruta)
    plt.close(fig)


def grafica_convergencia(resultados: list[ResultadoPrescripcion], ruta: Path) -> None:
    """Mejor costo por generación: mediana y rango intercuartílico entre estudiantes."""
    _estilo()
    largo = max(len(r.historial_costo) for r in resultados)
    # Las corridas detenidas antes conservan su último mejor costo.
    historiales = np.array(
        [np.pad(r.historial_costo, (0, largo - len(r.historial_costo)), mode="edge") for r in resultados]
    )
    generaciones = np.arange(1, largo + 1)
    q1, mediana, q3 = np.percentile(historiales, [25, 50, 75], axis=0)

    fig, ax = plt.subplots(figsize=(7.5, 4))
    ax.fill_between(generaciones, q1, q3, color=SERIE_1, alpha=0.12, linewidth=0)
    ax.plot(generaciones, mediana, color=SERIE_1, linewidth=2, solid_capstyle="round")
    ax.set_title(f"Convergencia del AG: mejor costo por generación ({len(resultados)} estudiantes)")
    ax.set_xlabel("Generación")
    ax.set_ylabel("Mejor costo (mediana y rango intercuartílico)")
    ax.grid(axis="y")
    ax.set_axisbelow(True)
    ax.set_xlim(1, largo)
    fig.savefig(ruta)
    plt.close(fig)


def grafica_antes_despues(
    resultados: list[ResultadoPrescripcion],
    indice_objetivo: int,
    umbral_h: float,
    ruta: Path,
    objetivo: str = "Class",
    nombre_objetivo: str = "Rendimiento académico",
    niveles: tuple[str, ...] = ("L", "M", "H"),
    niveles_prescritos: tuple[str, ...] = ("L", "M"),
) -> None:
    """Activación del objetivo con acciones actuales y prescritas (niveles del peor al mejor)."""
    _estilo()
    base = np.array([r.estado_base[indice_objetivo] for r in resultados])
    prescrito = np.array([r.estado_prescrito[indice_objetivo] for r in resultados])
    orden = np.argsort(base)
    base, prescrito = base[orden], prescrito[orden]
    x = np.arange(1, len(base) + 1)

    fig, ax = plt.subplots(figsize=(9, 4.5))
    if len(x) > MAX_PARES_VISIBLES:
        # Con muchos estudiantes los conectores se funden: la línea base ordenada
        # y la nube de valores prescritos muestran la misma comparación.
        ax.plot(x, base, color=SERIE_1, linewidth=2, zorder=3, label="Acciones actuales")
        ax.scatter(x, prescrito, s=10, color=SERIE_2, alpha=0.5, linewidth=0, zorder=2, label="Acciones prescritas")
    else:
        ax.vlines(x, base, prescrito, color=EJE, linewidth=1.2, zorder=1)
        ax.scatter(x, base, s=36, color=SERIE_1, edgecolor=SUPERFICIE, linewidth=1.5, zorder=3, label="Acciones actuales")
        ax.scatter(x, prescrito, s=36, color=SERIE_2, edgecolor=SUPERFICIE, linewidth=1.5, zorder=3, label="Acciones prescritas")
    ax.axhline(umbral_h, color=TINTA_TENUE, linewidth=1, zorder=0)
    ax.text(len(x) + 0.5, umbral_h, f" umbral {niveles[-1]} ({umbral_h:.2f})", va="center", ha="left", color=TINTA_SECUNDARIA, fontsize=9)
    ax.set_title(f"{nombre_objetivo} inferido por el FCM, antes y después de la prescripción")
    ax.set_xlabel(f"Registros de prueba con nivel {' o '.join(niveles_prescritos)} (ordenados por activación inicial)")
    ax.set_ylabel(f"Activación de {objetivo} (0 = {niveles[0]}, 1 = {niveles[-1]})")
    ax.set_ylim(0, 1)
    ax.set_xlim(0, len(x) + 1)
    ax.grid(axis="y")
    ax.set_axisbelow(True)
    ax.legend(loc="upper left", ncols=2, bbox_to_anchor=(0, -0.14))
    fig.savefig(ruta)
    plt.close(fig)


def grafica_pesos(
    pesos: np.ndarray,
    estructura: np.ndarray,
    nombres: list[str],
    descripciones: list[str],
    indices_destino: np.ndarray,
    ruta: Path,
) -> None:
    """Pesos causales w_ji aprendidos hacia los conceptos dinámicos."""
    _estilo()
    submatriz = pesos[:, indices_destino]
    permitidos = estructura[:, indices_destino]
    limite = max(1e-9, float(np.abs(submatriz).max()))

    fig, ax = plt.subplots(figsize=(1.3 * len(indices_destino) + 4.5, 0.42 * len(nombres) + 1.5))
    imagen = ax.imshow(np.where(permitidos, submatriz, np.nan), cmap=DIVERGENTE, vmin=-limite, vmax=limite, aspect="auto")
    for (fila, columna), valor in np.ndenumerate(submatriz):
        if not permitidos[fila, columna]:
            ax.text(columna, fila, "–", ha="center", va="center", color=TINTA_TENUE, fontsize=9)
            continue
        intenso = abs(valor) > 0.6 * limite
        ax.text(columna, fila, f"{valor:+.2f}", ha="center", va="center", fontsize=8.5, color="white" if intenso else TINTA)
    ax.set_xticks(range(len(indices_destino)), [nombres[i] for i in indices_destino])
    ax.set_yticks(range(len(nombres)), [f"{n}  {d}" for n, d in zip(nombres, descripciones)])
    ax.tick_params(length=0)
    ax.xaxis.tick_top()
    for lado in ax.spines.values():
        lado.set_visible(False)
    ax.set_title("Pesos causales aprendidos (origen en filas, destino en columnas)", pad=28)
    barra = fig.colorbar(imagen, ax=ax, fraction=0.05, pad=0.03)
    barra.outline.set_visible(False)
    barra.ax.tick_params(colors=TINTA_TENUE, labelcolor=TINTA_SECUNDARIA)
    fig.savefig(ruta)
    plt.close(fig)


def grafica_acciones(nombres: list[str], actuales: np.ndarray, recomendadas: np.ndarray, ruta: Path) -> None:
    """Nivel medio de cada acción (unidades originales): actual frente a recomendado."""
    _estilo()
    y = np.arange(len(nombres))[::-1]
    fig, ax = plt.subplots(figsize=(7.5, 0.7 * len(nombres) + 1.4))
    ax.hlines(y, actuales, recomendadas, color=EJE, linewidth=2, zorder=1)
    ax.scatter(actuales, y, s=64, color=SERIE_1, edgecolor=SUPERFICIE, linewidth=2, zorder=3, label="Media actual")
    ax.scatter(recomendadas, y, s=64, color=SERIE_2, edgecolor=SUPERFICIE, linewidth=2, zorder=3, label="Media recomendada")
    inicio = min(0.0, actuales.min(), recomendadas.min())
    fin = 1.25 * max(actuales.max(), recomendadas.max(), 1e-9)
    decimales = 0 if fin - inicio > 20 else 1 if fin - inicio > 2 else 2
    for yi, actual, recomendada in zip(y, actuales, recomendadas):
        ax.text(max(actual, recomendada) + 0.025 * (fin - inicio), yi, f"{recomendada:.{decimales}f} ({recomendada - actual:+.{decimales}f})",
                va="center", color=TINTA_SECUNDARIA, fontsize=9)
    ax.set_yticks(y, nombres)
    ax.tick_params(axis="y", length=0)
    ax.set_xlim(inicio, fin)
    ax.set_xlabel("Nivel de la acción (escala original del dataset)")
    ax.set_title("Acciones: nivel medio actual y recomendado")
    ax.grid(axis="x")
    ax.set_axisbelow(True)
    ax.spines["left"].set_visible(False)
    ax.legend(loc="upper left", ncols=2, bbox_to_anchor=(0, -0.2))
    fig.savefig(ruta)
    plt.close(fig)


# ---------------------------------------------------------------------------
# Mapa cognitivo como grafo (NetworkX)
# ---------------------------------------------------------------------------
ORDEN_ROL = {"accion": 0, "mutable": 1, "inmutable": 2}
ESTILO_ROL = {
    "accion": {"node_shape": "s", "node_color": TINTA, "edgecolors": SUPERFICIE},
    "mutable": {"node_shape": "o", "node_color": SUPERFICIE, "edgecolors": TINTA_SECUNDARIA},
    "inmutable": {"node_shape": "o", "node_color": TINTA_TENUE, "edgecolors": SUPERFICIE},
}
NOMBRE_ROL = {"accion": "Acción (C_P)", "mutable": "Sistema mutable (C_S)", "inmutable": "Sistema inmutable (C_S)"}


def disposicion_radial(conceptos: list[dict], objetivo_id: str) -> dict[str, tuple[float, float]]:
    """Objetivo al centro, otros dinámicos en un anillo interior y los fijos afuera, agrupados por rol."""
    externos = sorted((c for c in conceptos if not c["dinamico"]), key=lambda c: ORDEN_ROL.get(c["rol"], 3))
    grupos = len(dict.fromkeys(c["rol"] for c in externos))
    pasos = max(len(externos) + grupos, 1)
    posiciones, paso, previo = {}, 0, None
    for c in externos:
        if previo is not None and c["rol"] != previo:
            paso += 1  # Hueco entre grupos de rol.
        previo = c["rol"]
        angulo = np.pi / 2 - 2 * np.pi * (paso + 0.5) / pasos
        posiciones[c["id"]] = (float(np.cos(angulo)), float(np.sin(angulo)))
        paso += 1
    internos = [c for c in conceptos if c["dinamico"] and c["id"] != objetivo_id]
    for k, c in enumerate(internos):
        angulo = np.pi / 2 - 2 * np.pi * k / len(internos)
        posiciones[c["id"]] = (0.45 * float(np.cos(angulo)), 0.45 * float(np.sin(angulo)))
    posiciones[objetivo_id] = (0.0, 0.0)
    return posiciones


def grafica_red_fcm(
    pesos: np.ndarray,
    estructura: np.ndarray,
    conceptos: list[dict],
    objetivo_id: str,
    ruta: Path,
    etiquetas_peso: int = 6,
) -> None:
    """Grafo dirigido del FCM con NetworkX: nodos por rol y aristas con grosor |w_ji| y color por signo.

    ``conceptos`` sigue el orden de la matriz: {id, nombre, rol, dinamico}.
    Se rotulan los ``etiquetas_peso`` pesos más fuertes.
    """
    _estilo()
    grafo = nx.DiGraph()
    ids = [c["id"] for c in conceptos]
    for c in conceptos:
        grafo.add_node(c["id"], rol=c["rol"])
    for j, i in zip(*np.nonzero(estructura)):
        if abs(pesos[j, i]) > 1e-6:
            grafo.add_edge(ids[j], ids[i], peso=float(pesos[j, i]))
    posiciones = disposicion_radial(conceptos, objetivo_id)
    nodos = list(grafo.nodes)
    tamanos = [2600 if n == objetivo_id else 380 for n in nodos]
    # Con muchos conceptos (por ejemplo, indicadores one-hot) los rótulos horizontales se
    # superponen abajo y arriba del anillo: se giran en la dirección radial.
    radial = sum(not c["dinamico"] for c in conceptos) > 18

    fig, ax = plt.subplots(figsize=(10, 10) if radial else (10, 8.8))
    aristas = sorted(grafo.edges(data="peso"), key=lambda a: abs(a[2]))  # Las fuertes quedan encima.
    maximo = max((abs(w) for *_, w in aristas), default=1.0)
    for origen, destino, peso in aristas:
        fuerza = abs(peso) / maximo
        nx.draw_networkx_edges(
            grafo, posiciones, edgelist=[(origen, destino)], ax=ax, nodelist=nodos, node_size=tamanos,
            width=0.6 + 5.4 * fuerza, edge_color=SERIE_1 if peso >= 0 else NEGATIVO, alpha=0.25 + 0.7 * fuerza,
            arrows=True, arrowstyle="-|>", arrowsize=9 + 8 * fuerza, connectionstyle="arc3,rad=0.05",
        )
    for rol, estilo in ESTILO_ROL.items():
        del_rol = [n for n in nodos if grafo.nodes[n]["rol"] == rol and n != objetivo_id]
        if del_rol:
            nx.draw_networkx_nodes(grafo, posiciones, nodelist=del_rol, node_size=380, linewidths=1.8, ax=ax, **estilo)
    nx.draw_networkx_nodes(grafo, posiciones, nodelist=[objetivo_id], node_size=2600, node_color=PIZARRA,
                           edgecolors=SUPERFICIE, linewidths=2.5, ax=ax)

    fuertes = sorted(aristas, key=lambda a: -abs(a[2]))[:etiquetas_peso]
    nx.draw_networkx_edge_labels(
        grafo, posiciones, edge_labels={(o, d): f"{w:+.2f}" for o, d, w in fuertes}, label_pos=0.4, font_size=8,
        font_color=TINTA, bbox={"boxstyle": "round,pad=0.2", "fc": SUPERFICIE, "ec": "none", "alpha": 0.9}, ax=ax,
    )
    for c in conceptos:
        x, y = posiciones[c["id"]]
        if c["id"] == objetivo_id:
            ax.text(x, y + 0.025, c["id"], ha="center", va="center", color="white", fontsize=10, fontweight="bold")
            ax.text(x, y - 0.045, "C_T", ha="center", va="center", color="#d6e3dc", fontsize=8)
            ax.text(x, y - 0.17, c["nombre"], ha="center", va="top", color=TINTA, fontsize=9, fontweight="bold",
                    bbox={"boxstyle": "round,pad=0.25", "fc": SUPERFICIE, "ec": "none", "alpha": 0.85})
            continue
        texto = f"{c['id']} {c['nombre']}"
        texto = texto if len(texto) <= 28 else texto[:27] + "…"
        derecha = x >= -0.01
        if radial and not c["dinamico"]:
            angulo = float(np.degrees(np.arctan2(y, x)))
            ax.text(x * 1.07, y * 1.07, texto, rotation=angulo if derecha else angulo + 180, rotation_mode="anchor",
                    ha="left" if derecha else "right", va="center", color=TINTA_SECUNDARIA, fontsize=8)
            continue
        distancia = 1.09 if not c["dinamico"] else 1.25
        ax.text(x * distancia, y * distancia, texto, ha="left" if derecha else "right", va="center",
                color=TINTA_SECUNDARIA, fontsize=8.5)

    leyenda = [
        Line2D([], [], marker="s", linestyle="", markersize=8, markerfacecolor=TINTA, markeredgecolor=TINTA, label=NOMBRE_ROL["accion"]),
        Line2D([], [], marker="o", linestyle="", markersize=8, markerfacecolor=SUPERFICIE, markeredgecolor=TINTA_SECUNDARIA,
               markeredgewidth=1.8, label=NOMBRE_ROL["mutable"]),
        Line2D([], [], marker="o", linestyle="", markersize=8, markerfacecolor=TINTA_TENUE, markeredgecolor=TINTA_TENUE,
               label=NOMBRE_ROL["inmutable"]),
        Line2D([], [], color=SERIE_1, linewidth=3, label="Peso positivo: acerca al mejor nivel"),
        Line2D([], [], color=NEGATIVO, linewidth=3, label="Peso negativo: aleja del mejor nivel"),
    ]
    ax.legend(handles=leyenda, loc="upper center", bbox_to_anchor=(0.5, -0.01), ncols=3, fontsize=8.5)
    ax.set_title("Mapa cognitivo difuso aprendido (grafo dirigido con NetworkX)", pad=26)
    ax.text(0, 1.01, "Grosor de cada arista: |w_ji|; se rotulan los pesos más fuertes.", transform=ax.transAxes,
            va="bottom", color=TINTA_SECUNDARIA, fontsize=9)
    alto = 1.75 if radial else 1.3
    ax.set_xlim(-1.75, 1.75)
    ax.set_ylim(-alto, alto)
    ax.set_aspect("equal")
    ax.axis("off")
    fig.savefig(ruta)
    plt.close(fig)


def generar_figuras(r: "ResultadoPipeline", salida: Path, lambda_articulo: float | None = None) -> list[str]:
    """Todas las figuras de una ejecución en ``salida``; devuelve los nombres de archivo generados."""
    from .esquema import rol_de  # Importación tardía: esquema importa el pipeline.

    salida.mkdir(parents=True, exist_ok=True)
    pre, fcm, esquema = r.pre, r.fcm, r.esquema
    conceptos = esquema.conceptos
    orden = tuple(sorted(esquema.niveles, key=esquema.niveles.get))
    figuras: list[str] = []

    if r.seleccion_cv is not None:
        sel = r.opciones.config_seleccion
        grafica_seleccion(
            r.seleccion_cv,
            r.config_fcm.lambda_,
            r.config_fcm.alpha_l2,
            salida / "seleccion_hiperparametros.png",
            exactitud_mayoritaria=float(pd.Series(pre.etiquetas(r.entrenamiento)).value_counts(normalize=True).max()),
            lambda_articulo=lambda_articulo if lambda_articulo in sel.rejilla_lambda else None,
        )
        figuras.append("seleccion_hiperparametros.png")
    grafica_red_fcm(
        fcm.pesos,
        fcm.estructura,
        [{"id": c.id, "nombre": c.nombre, "rol": rol_de(esquema, c), "dinamico": c.dinamico} for c in conceptos],
        conceptos[pre.indice_objetivo].id,
        salida / "red_fcm.png",
    )
    figuras.append("red_fcm.png")
    grafica_convergencia(r.resultados, salida / "convergencia_ag.png")
    figuras.append("convergencia_ag.png")
    grafica_antes_despues(
        r.resultados, pre.indice_objetivo, 1.0 - r.config_prescripcion.tolerancia_exito, salida / "rendimiento_antes_despues.png",
        objetivo=esquema.objetivo, nombre_objetivo=conceptos[pre.indice_objetivo].nombre, niveles=orden,
        niveles_prescritos=tuple(r.config_prescripcion.clases_a_prescribir),
    )
    figuras.append("rendimiento_antes_despues.png")
    grafica_pesos(fcm.pesos, fcm.estructura, fcm.nombres, [c.nombre for c in conceptos], pre.indices_dinamicos, salida / "pesos_fcm.png")
    figuras.append("pesos_fcm.png")
    grafica_acciones(
        [f"{conceptos[i].id} {conceptos[i].nombre}" for i in pre.indices_accion],
        np.array([r.recomendaciones[f"{pre.columnas[i]}_actual"].mean() for i in pre.indices_accion]),
        np.array([r.recomendaciones[f"{pre.columnas[i]}_recomendado"].mean() for i in pre.indices_accion]),
        salida / "acciones_recomendadas.png",
    )
    figuras.append("acciones_recomendadas.png")
    return figuras
