#!/bin/bash

#!/bin/bash

# Script para actualizar Gym Tracker desde GitHub y reconstruir imagen
# Uso: ./update.sh [directorio] [puerto]

DIR=${1:-/mnt/user/appdata/gym-tracker}
PORT=${2:-3005}

echo "Actualizando código desde GitHub en $DIR..."
cd "$DIR" || exit 1
git pull origin main  # Cambia 'main' por tu rama si es diferente

echo "Reconstruyendo imagen Docker..."
docker build -t gym-tracker .

echo "Reiniciando contenedor..."
docker stop gym-tracker
docker rm gym-tracker
docker run -d \
  --name gym-tracker \
  -p $PORT:$PORT \
  -v "$DIR/data:/usr/src/app/data" \
  --restart unless-stopped \
  gym-tracker

echo "Actualización completada. Accede a http://<IP>:$PORT"
