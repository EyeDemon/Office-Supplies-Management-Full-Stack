#!/bin/bash
# scripts/db-backup.sh — MySQL Automated Backup (DO-06)
# Chạy bên trong backup container — truy cập trực tiếp qua Docker network.
# Không dùng docker exec vì script này CHÍNH LÀ container backup.
#
# Env vars (từ docker-compose):
#   MYSQL_HOST, MYSQL_PORT, MYSQL_ROOT_PASSWORD, DB_NAME, BACKUP_DIR, RETENTION_DAYS
 
set -euo pipefail
 
MYSQL_HOST="${MYSQL_HOST:-db}"
MYSQL_PORT="${MYSQL_PORT:-3306}"
DB_NAME="${DB_NAME:-qlvpp}"
BACKUP_DIR="${BACKUP_DIR:-/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/${DB_NAME}-${TIMESTAMP}.sql.gz"
 
mkdir -p "$BACKUP_DIR"
 
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Bắt đầu backup '${DB_NAME}' từ ${MYSQL_HOST}:${MYSQL_PORT}..."
 
# Dùng MYSQL_PWD thay vì -p trên CLI để tránh lộ password qua process list
MYSQL_PWD="${MYSQL_ROOT_PASSWORD}" mysqldump \
  --host="${MYSQL_HOST}" \
  --port="${MYSQL_PORT}" \
  --user=root \
  --single-transaction \
  --routines \
  --triggers \
  --add-drop-table \
  "${DB_NAME}" | gzip > "${BACKUP_FILE}"
 
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Backup OK: ${BACKUP_FILE} ($(du -sh "${BACKUP_FILE}" | cut -f1))"
 
# Xóa file cũ
find "$BACKUP_DIR" -name "*.sql.gz" -mtime "+${RETENTION_DAYS}" -delete
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Còn $(find "$BACKUP_DIR" -name "*.sql.gz" | wc -l) file backup."
 