#!/bin/bash

# Pharez API - Automated Deployment Script
# This script automates common deployment tasks
# Usage: bash deploy.sh [command] [options]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
APP_DIR="/opt/pharez-api"
APP_NAME="pharez-api"
DB_BACKUP_DIR="/var/backups/pharez-db"
LOG_DIR="/var/log/pharez-api"

# Functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Check if running as root/sudo
check_sudo() {
    if [ "$EUID" -ne 0 ]; then
        log_error "This script must be run with sudo"
        exit 1
    fi
}

# Display help
show_help() {
    cat << EOF
Pharez API Deployment Script

Usage: sudo bash deploy.sh [command] [options]

Commands:
    help                  Show this help message
    check-system         Check system requirements
    setup-env            Setup environment and dependencies
    setup-db             Setup PostgreSQL database
    deploy               Deploy application
    migrate              Run database migrations
    backup-db            Backup database
    restore-db [file]    Restore database from backup
    start                Start application
    stop                 Stop application
    restart              Restart application
    status               Check application status
    logs                 Show application logs
    health               Check health endpoint
    update               Pull latest code and restart

Examples:
    sudo bash deploy.sh check-system
    sudo bash deploy.sh setup-env
    sudo bash deploy.sh deploy
    sudo bash deploy.sh backup-db
    sudo bash deploy.sh status
    sudo bash deploy.sh logs

EOF
}

# Check system requirements
check_system() {
    log_info "Checking system requirements..."

    # Check Node.js
    if ! command -v node &> /dev/null; then
        log_error "Node.js is not installed"
        return 1
    fi
    NODE_VERSION=$(node --version)
    log_success "Node.js found: $NODE_VERSION"

    # Check npm
    if ! command -v npm &> /dev/null; then
        log_error "npm is not installed"
        return 1
    fi
    NPM_VERSION=$(npm --version)
    log_success "npm found: $NPM_VERSION"

    # Check PostgreSQL
    if ! command -v psql &> /dev/null; then
        log_warning "PostgreSQL client not installed (required for local DB only)"
    else
        PSQL_VERSION=$(psql --version)
        log_success "PostgreSQL client found: $PSQL_VERSION"
    fi

    # Check Nginx
    if ! command -v nginx &> /dev/null; then
        log_warning "Nginx not installed"
    else
        log_success "Nginx is installed"
    fi

    # Check PM2
    if ! command -v pm2 &> /dev/null; then
        log_warning "PM2 not installed globally"
    else
        log_success "PM2 is installed"
    fi

    # Check system resources
    log_info "System Resources:"
    echo "  CPU Cores: $(nproc)"
    echo "  RAM: $(free -h | awk '/^Mem:/ {print $2}')"
    echo "  Disk: $(df -h / | awk 'NR==2 {print $2}' | head -1)"

    log_success "System check completed"
}

# Setup environment
setup_env() {
    log_info "Setting up environment..."

    # Create necessary directories
    mkdir -p "$APP_DIR"
    mkdir -p "$LOG_DIR"
    mkdir -p "$DB_BACKUP_DIR"

    # Install PM2 globally if not present
    if ! command -v pm2 &> /dev/null; then
        log_info "Installing PM2..."
        npm install -g pm2
        log_success "PM2 installed"
    fi

    # Create log directory
    chmod 755 "$LOG_DIR"

    log_success "Environment setup completed"
}

# Setup database
setup_db() {
    log_info "Setting up PostgreSQL database..."

    if [ -z "$DB_HOST" ] || [ -z "$DB_NAME" ] || [ -z "$DB_USER" ] || [ -z "$DB_PASSWORD" ]; then
        log_error "Database environment variables not set. Please set DB_HOST, DB_NAME, DB_USER, DB_PASSWORD"
        return 1
    fi

    # Create database and user
    PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -U "$DB_USER" -d "postgres" << EOF
CREATE DATABASE IF NOT EXISTS $DB_NAME;
CREATE USER IF NOT EXISTS $DB_USER WITH PASSWORD '$DB_PASSWORD';
ALTER ROLE $DB_USER SET client_encoding TO 'utf8';
ALTER ROLE $DB_USER SET default_transaction_isolation TO 'read committed';
ALTER ROLE $DB_USER SET timezone TO 'UTC';
GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;
EOF

    if [ $? -eq 0 ]; then
        log_success "Database setup completed"
    else
        log_error "Database setup failed"
        return 1
    fi
}

# Deploy application
deploy() {
    log_info "Starting deployment..."

    # Change to app directory
    cd "$APP_DIR"

    # Pull latest code
    log_info "Pulling latest code..."
    git pull origin main
    log_success "Code pulled"

    # Install dependencies
    log_info "Installing dependencies..."
    npm install --production
    log_success "Dependencies installed"

    # Run migrations
    log_info "Running database migrations..."
    npm run migrate
    log_success "Migrations completed"

    # Start/restart application
    log_info "Starting application with PM2..."
    pm2 restart "$APP_NAME" || pm2 start ecosystem.config.js
    log_success "Application started/restarted"

    log_success "Deployment completed successfully"
}

# Run database migrations
migrate() {
    log_info "Running database migrations..."
    cd "$APP_DIR"
    npm run migrate
    log_success "Migrations completed"
}

# Backup database
backup_db() {
    log_info "Creating database backup..."

    TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
    BACKUP_FILE="$DB_BACKUP_DIR/pharez_backup_$TIMESTAMP.sql.gz"

    mkdir -p "$DB_BACKUP_DIR"

    if [ -z "$DB_HOST" ] || [ -z "$DB_NAME" ] || [ -z "$DB_USER" ] || [ -z "$DB_PASSWORD" ]; then
        log_error "Database credentials not configured"
        return 1
    fi

    PGPASSWORD="$DB_PASSWORD" pg_dump -h "$DB_HOST" -U "$DB_USER" "$DB_NAME" | gzip > "$BACKUP_FILE"

    if [ $? -eq 0 ]; then
        log_success "Backup created: $BACKUP_FILE"
        
        # Cleanup old backups (keep only 30 days)
        find "$DB_BACKUP_DIR" -name "pharez_backup_*.sql.gz" -mtime +30 -delete
        log_info "Old backups cleaned up"
    else
        log_error "Backup failed"
        return 1
    fi
}

# Restore database
restore_db() {
    if [ -z "$1" ]; then
        log_error "Backup file path required"
        echo "Usage: restore_db [path-to-backup-file]"
        return 1
    fi

    BACKUP_FILE="$1"

    if [ ! -f "$BACKUP_FILE" ]; then
        log_error "Backup file not found: $BACKUP_FILE"
        return 1
    fi

    log_warning "This will overwrite the current database!"
    read -p "Are you sure? (yes/no): " confirm

    if [ "$confirm" != "yes" ]; then
        log_info "Restore cancelled"
        return 0
    fi

    log_info "Restoring database from $BACKUP_FILE..."

    if [ -z "$DB_HOST" ] || [ -z "$DB_NAME" ] || [ -z "$DB_USER" ] || [ -z "$DB_PASSWORD" ]; then
        log_error "Database credentials not configured"
        return 1
    fi

    gunzip -c "$BACKUP_FILE" | PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -U "$DB_USER" "$DB_NAME"

    if [ $? -eq 0 ]; then
        log_success "Database restored successfully"
    else
        log_error "Database restore failed"
        return 1
    fi
}

# Start application
start_app() {
    log_info "Starting application..."
    cd "$APP_DIR"
    pm2 start ecosystem.config.js || pm2 start "$APP_NAME"
    log_success "Application started"
}

# Stop application
stop_app() {
    log_info "Stopping application..."
    pm2 stop "$APP_NAME"
    log_success "Application stopped"
}

# Restart application
restart_app() {
    log_info "Restarting application..."
    cd "$APP_DIR"
    pm2 restart "$APP_NAME"
    log_success "Application restarted"
}

# Check status
check_status() {
    log_info "Checking application status..."
    pm2 status
}

# Show logs
show_logs() {
    log_info "Showing application logs (press Ctrl+C to exit)..."
    pm2 logs "$APP_NAME"
}

# Health check
health_check() {
    log_info "Checking application health..."

    RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/health)

    if [ "$RESPONSE" = "200" ]; then
        log_success "Health check passed (HTTP $RESPONSE)"
        curl -s http://localhost:3000/health | python3 -m json.tool
    else
        log_error "Health check failed (HTTP $RESPONSE)"
        return 1
    fi
}

# Update application
update_app() {
    log_info "Updating application..."
    
    # Backup database first
    backup_db

    # Deploy
    deploy

    # Health check
    health_check

    log_success "Application updated successfully"
}

# Main script
if [ $# -eq 0 ]; then
    show_help
    exit 0
fi

case "$1" in
    help)
        show_help
        ;;
    check-system)
        check_system
        ;;
    setup-env)
        check_sudo
        setup_env
        ;;
    setup-db)
        check_sudo
        setup_db
        ;;
    deploy)
        check_sudo
        deploy
        ;;
    migrate)
        check_sudo
        migrate
        ;;
    backup-db)
        check_sudo
        backup_db
        ;;
    restore-db)
        check_sudo
        restore_db "$2"
        ;;
    start)
        check_sudo
        start_app
        ;;
    stop)
        check_sudo
        stop_app
        ;;
    restart)
        check_sudo
        restart_app
        ;;
    status)
        check_status
        ;;
    logs)
        show_logs
        ;;
    health)
        health_check
        ;;
    update)
        check_sudo
        update_app
        ;;
    *)
        log_error "Unknown command: $1"
        show_help
        exit 1
        ;;
esac

exit $?
