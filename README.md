# Gym Tracker

Aplicación web para seguimiento de entrenamiento en el gimnasio con persistencia en SQLite y exportación de datos en CSV.

## Características

- **Página principal motivadora** con diseño agresivo y moderno
- Registrar sesiones de entrenamiento con fecha, ejercicio, series, repeticiones, peso y notas
- Ver historial completo de entrenamientos
- Página de estadísticas básicas
- Guardar los datos en una base de datos SQLite local
- Eliminar sesiones
- Exportar el historial completo a CSV

## Desarrollo Local

### Instalación

1. Abre una terminal en `c:\Users\Gonzalo\Documents\VSCode\Proyectos\gym-tracker`
2. Ejecuta:

```bash
npm install
```

### Ejecutar

```bash
npm start
```

Luego abre `http://localhost:3005` en tu navegador para ver la página principal.

## Despliegue en Docker

### Construir la Imagen

Abre una terminal en el proyecto y ejecuta:

```bash
docker build -t gym-tracker .
```

### Ejecutar el Contenedor

Usa un volumen para persistir la base de datos SQLite:

```bash
docker run -d \
  --name gym-tracker \
  -p 3005:3005 \
  -v /ruta/local/data:/usr/src/app/data \
  --restart unless-stopped \
  gym-tracker
```

Reemplaza `/ruta/local/data` por la carpeta donde quieras guardar los datos.

### Acceder a la Aplicación

Abre en el navegador:

```text
http://localhost:3005
```

## Despliegue en Unraid

### Paso 1: Subir el Proyecto al Servidor

1. Copia la carpeta del proyecto (`gym-tracker`) a tu servidor Unraid, por ejemplo en `/mnt/user/appdata/gym-tracker/`.
2. O usa Git para clonar el repositorio si tienes uno.

### Paso 2: Construir la Imagen Docker

1. Abre la terminal en Unraid (o conecta via SSH).
2. Navega a la carpeta del proyecto:

```bash
cd /mnt/user/appdata/gym-tracker
```

3. Construye la imagen:

```bash
docker build -t gym-tracker .
```

### Paso 3: Crear el Contenedor en Unraid

1. En la interfaz web de Unraid, ve a **Docker** > **Add Container**.
2. Configura:
   - **Name**: `gym-tracker`
   - **Repository**: `gym-tracker` (la imagen que acabas de construir)
   - **Docker Hub URL**: Deja vacío (es una imagen local)
3. En **Port Mappings**:
   - Host Port: `3005` (o el puerto que quieras usar)
   - Container Port: `3005`
4. En **Volume Mappings**:
   - Container Path: `/usr/src/app/data`
   - Host Path: `/mnt/user/appdata/gym-tracker/data` (o la ruta donde quieres persistir la DB)
5. En **Restart Policy**: `Unless Stopped`
6. Haz clic en **Apply** para crear y iniciar el contenedor.

### Paso 4: Acceder a la Aplicación

Abre en el navegador:

```text
http://<IP-de-tu-servidor-Unraid>:3005
```

### Notas para Unraid

- Asegúrate de que Docker esté habilitado en Unraid.
- La base de datos SQLite se guarda en el volumen montado, por lo que los datos persisten.
- Si cambias el puerto, actualiza la URL de acceso.
- Para actualizar, reconstruye la imagen y reinicia el contenedor.

## Estructura del Proyecto

- `server.js`: servidor Express y API REST.
- `db.js`: configuración y creación de base de datos SQLite.
- `public/index.html`: página principal con diseño motivador.
- `public/sessions.html`: página para gestionar sesiones de entrenamiento.
- `public/stats.html`: página de estadísticas básicas.
- `public/app.js`: JavaScript para la gestión de sesiones.
- `public/stats.js`: JavaScript para estadísticas.
- `public/styles.css`: estilos CSS agresivos y modernos.
- `data/`: contenedor de la base de datos SQLite generada.
- `Dockerfile`: configuración para construir el contenedor Docker.
- `.dockerignore`: archivos a ignorar al construir la imagen.

## Uso

- Desde la página principal, accede a "Nueva Sesión" para registrar entrenamientos.
- Usa "Ver Estadísticas" para ver métricas básicas.
- Agrega una sesión en el formulario.
- Revisa el historial en la tabla.
- Usa el botón "Exportar CSV" para descargar los datos.

## Actualización Automatizada con GitHub

### Limitaciones Técnicas

Un contenedor Docker no puede reconstruir su propia imagen mientras está corriendo, porque eso requiere acceso al Docker host. Por eso, no es posible que el contenedor "se actualice solo" completamente.

### Solución Recomendada: Script en el Host (Unraid)

Usa el script `update.sh` que creé, pero ejecútalo desde Unraid. No es "externo" en el sentido de separado, sino parte del proceso de despliegue.

Para automatizarlo:

1. Instala el plugin **User Scripts** en Unraid (desde Community Apps).
2. Crea un nuevo script con el contenido de `update.sh`.
3. Configura el script para que se ejecute:
   - Manualmente cuando quieras actualizar.
   - O automáticamente con un cron job (ej. cada noche).

### Alternativa con Watchtower (Auto-Update de Imágenes)

Si subes la imagen a Docker Hub:

1. Construye y push la imagen:

```bash
docker build -t tu-usuario/gym-tracker .
docker push tu-usuario/gym-tracker
```

2. Instala Watchtower en Unraid (desde Community Apps).
3. Configura Watchtower para monitorear tu imagen y reiniciar automáticamente cuando haya una nueva versión.

Esto es lo más cercano a "automático" sin scripts manuales.

### Configurar Repositorio en GitHub

1. Crea un repositorio y sube el proyecto:

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/tu-usuario/gym-tracker.git
git push -u origin main
```

2. Para cambios, haz commits y push desde local.

### Notas

- El Dockerfile ahora incluye git, por si quieres experimentar con entrypoints.
- Para actualizaciones, el proceso siempre requiere reconstruir la imagen en el host.
- Si hago cambios, te envío el código para que lo subas a GitHub y ejecutes la actualización.
