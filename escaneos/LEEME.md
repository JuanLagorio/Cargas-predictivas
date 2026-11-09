# Escaneos de planillas

Poné acá las fotos o escaneos de las grillas en papel. **Esta carpeta no se sube a GitHub** (está en `.gitignore`), porque tiene datos del negocio.

Para que sea fácil pasarlas:

- Un archivo por planilla, nombrado `AAAA-MM-DD_reparto.jpg` (por ejemplo `2026-10-06_reparto-1.jpg`). Si no sabés la fecha exacta, poné lo que diga la hoja.
- Foto derecha, con buena luz, que se lean los números.
- Si una planilla tiene dos hojas: `2026-10-06_reparto-1_a.jpg` y `..._b.jpg`.

Después pedile a Claude: *"leé los escaneos de la carpeta escaneos y armá el CSV para importar"*. Va a generar `escaneos/historial.csv` con el formato que espera la app (ver el LEEME principal) y una lista de lo que no se pudo leer bien, para revisar a mano antes de importar.
