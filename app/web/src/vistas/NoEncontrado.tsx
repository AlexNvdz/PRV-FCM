import { Link } from 'react-router';

import { Vacio } from '../componentes/ui';

export function NoEncontrado() {
  return (
    <Vacio
      titulo="Esta página no existe"
      accion={
        <Link to="/" className="inline-flex h-9 items-center rounded-md bg-boton px-4 text-sm font-medium text-boton-texto">
          Volver al resumen
        </Link>
      }
    >
      Revise la dirección o use el menú.
    </Vacio>
  );
}
