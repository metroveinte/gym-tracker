#!/bin/bash

# Script para actualizar Gym Tracker desde GitHub y reconstruir imagen
# Uso: ./update.sh [directorio] [puerto]

DIR=${1:-/mnt/user/appdata/gym-tracker}
PORT=${2:-3005}

echo "==== ACTUALIZACIÓN DE GYM TRACKER ===="
echo ""
echo "Actualizando código desde GitHub en $DIR..."
cd "$DIR" || exit 1

if ! git pull origin main; then
  echo "ERROR: No se pudo hacer git pull. Verifica la rama (por defecto: main)"
  exit 1
fi

echo ""
echo "Reconstruyendo imagen Docker (sin caché)..."
if ! docker build --no-cache -t gym-tracker .; then
  echo "ERROR: Falló la construcción de la imagen Docker"
  exit 1
fi

echo ""
echo "Deteniendo contenedor anterior..."
docker stop gym-tracker || echo "Contenedor no estaba corriendo"
docker rm gym-tracker || echo "Contenedor no existe"

echo ""
echo "Iniciando nuevo contenedor..."
if docker run -d \
  --name gym-tracker \
  -p $PORT:3005 \
  -v "$DIR/data:/usr/src/app/data" \
  --restart unless-stopped \
  gym-tracker; then
  echo ""
  echo "✓ ACTUALIZACIÓN COMPLETADA"
  echo "  Accede a http://<IP>:$PORT"
  echo ""
  echo "Limpia la caché del navegador (Ctrl+Shift+Supr o Cmd+Shift+Supr) para ver los cambios."
else
  echo "ERROR: Falló el inicio del contenedor"
  exit 1
fi

