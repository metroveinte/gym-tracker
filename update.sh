#!/bin/bash

# Script para actualizar Gym Tracker desde GitHub y reconstruir imagen

echo "Actualizando código desde GitHub..."
cd /mnt/user/appdata/gym-tracker
git pull origin main  # Cambia 'main' por tu rama si es diferente

echo "Reconstruyendo imagen Docker..."
docker build -t gym-tracker .

echo "Reiniciando contenedor..."
docker stop gym-tracker
docker rm gym-tracker
docker run -d \
  --name gym-tracker \
  -p 3000:3000 \
  -v /mnt/user/appdata/gym-tracker/data:/usr/src/app/data \
  --restart unless-stopped \
  gym-tracker

echo "Actualización completada. Accede a http://<IP>:3000"
