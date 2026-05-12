#!/bin/bash

# Script para actualizar Gym Tracker desde GitHub y reconstruir imagen
# Uso: ./update.sh [directorio] [puerto]

DIR=${1:-/mnt/user/appdata/gym-tracker}
PORT=${2:-3005}
REPO_URL=${3:-https://github.com/metroveinte/gym-tracker.git}
BRANCH=${4:-main}

echo "==== ACTUALIZACIÓN DE GYM TRACKER ===="
echo ""
echo "Actualizando código en $DIR..."

if [ ! -d "$DIR" ]; then
  echo "Directorio no existe. Clonando repositorio desde $REPO_URL"
  mkdir -p "$(dirname "$DIR")"
  if ! git clone --branch "$BRANCH" "$REPO_URL" "$DIR"; then
    echo "ERROR: Falló git clone desde $REPO_URL"
    exit 1
  fi
else
  cd "$DIR" || exit 1

  if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    remote_url=$(git config --get remote.origin.url || true)
    if [ "$remote_url" != "$REPO_URL" ]; then
      echo "Remote origin actual es '$remote_url'. Ajustando a $REPO_URL"
      git remote remove origin 2>/dev/null || true
      git remote add origin "$REPO_URL"
    fi
    echo "Repositorio Git detectado. Haciendo git pull de $BRANCH desde $REPO_URL..."
    if ! git fetch origin "$BRANCH"; then
      echo "ERROR: Falló git fetch desde $REPO_URL"
      exit 1
    fi
    if ! git checkout "$BRANCH"; then
      echo "ERROR: Falló git checkout $BRANCH"
      exit 1
    fi
    if ! git pull origin "$BRANCH"; then
      echo "ERROR: No se pudo hacer git pull de $BRANCH"
      exit 1
    fi
  else
    if [ -z "$(ls -A "$DIR")" ]; then
      echo "El directorio está vacío. Clonando repositorio desde $REPO_URL"
      if ! git clone --branch "$BRANCH" "$REPO_URL" "$DIR"; then
        echo "ERROR: Falló git clone desde $REPO_URL"
        exit 1
      fi
    else
      echo "AVISO: $DIR no es un repositorio Git y no está vacío."
      echo "Se usará el código local existente porque no hay historial Git disponible."
      echo "Si quieres forzar una clonación limpia, elimina el contenido de $DIR y vuelve a ejecutar el script."
    fi
  fi
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

