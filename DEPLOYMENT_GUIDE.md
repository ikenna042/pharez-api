# Pharez API - Production Deployment Guide

## Overview

Pharez API is a Node.js Express application with PostgreSQL database backend. This guide provides step-by-step instructions for deploying the application to your organization's server.

---

## Prerequisites

Before deployment, ensure your server has:

- **Node.js**: v18.0.0 or higher
- **PostgreSQL**: v12.0 or higher (or managed cloud database)
- **npm**: v8.0.0 or higher
- **Git**: For cloning the repository
- **SSL Certificate** (for HTTPS)

### Recommended Server Requirements

- **CPU**: 2+ cores
- **RAM**: 2GB minimum (4GB recommended)
- **Storage**: 20GB+ for database and logs
- **Bandwidth**: Adequate for expected traffic

---

## Step 1: Prepare Your Server

### 1.1 Update System
```bash
# Ubuntu/Debian
sudo apt update && sudo apt upgrade -y

# CentOS/RHEL
sudo yum update -y
```

### 1.2 Install Node.js & npm
```bash
# Ubuntu/Debian (using NodeSource repository)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify installation
node --version
npm --version
```

### 1.3 Install PostgreSQL (if not using cloud database)
```bash
# Ubuntu/Debian
sudo apt-get install -y postgresql postgresql-contrib

# Start service
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

---

## Step 2: Database Setup

### 2.1 Create Database & User

**Option A: Local PostgreSQL Installation**

```bash
sudo -u postgres psql
```

In the PostgreSQL prompt, run:

```sql
-- Create database
CREATE DATABASE pharezdb;

-- Create user with password
CREATE USER pharezdb_user WITH PASSWORD 'your_secure_password_here';

-- Grant privileges
ALTER ROLE pharezdb_user SET client_encoding TO 'utf8';
ALTER ROLE pharezdb_user SET default_transaction_isolation TO 'read committed';
ALTER ROLE pharezdb_user SET default_transaction_deferrable TO on;
ALTER ROLE pharezdb_user SET timezone TO 'UTC';
GRANT ALL PRIVILEGES ON DATABASE pharezdb TO pharezdb_user;

-- Connect to the database and grant schema privileges
\c pharezdb
GRANT ALL ON SCHEMA public TO pharezdb_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO pharezdb_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO pharezdb_user;

\q
```

**Option B: Cloud Database (Recommended)**
- Use managed PostgreSQL services: AWS RDS, Google Cloud SQL, Render, Neon, or similar
- Create database and user through the provider's dashboard
- Note down the connection details

### 2.2 Database Backup & Recovery Plan

Create a backup script:

```bash
#!/bin/bash
# backup_db.sh

BACKUP_DIR="/var/backups/pharez-db"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
DB_NAME="pharezdb"
DB_USER="pharezdb_user"
DB_HOST="your_db_host"
BACKUP_FILE="$BACKUP_DIR/pharez_backup_$TIMESTAMP.sql.gz"

mkdir -p $BACKUP_DIR

pg_dump -h $DB_HOST -U $DB_USER $DB_NAME | gzip > $BACKUP_FILE

# Keep only last 30 days of backups
find $BACKUP_DIR -name "pharez_backup_*.sql.gz" -mtime +30 -delete

echo "Backup completed: $BACKUP_FILE"
```

Schedule daily backups using cron:
```bash
0 2 * * * /path/to/backup_db.sh  # Run daily at 2 AM
```

---

## Step 3: Clone & Setup Application

### 3.1 Clone Repository
```bash
cd /opt  # or your preferred directory
git clone https://github.com/your-org/pharez-api.git
cd pharez-api
```

### 3.2 Install Dependencies
```bash
npm install --production
```

### 3.3 Create .env File for Production
```bash
nano .env
```

Populate with production values:

```env
# Server Configuration
NODE_ENV=production
PORT=3000

# Database Configuration
DB_HOST=your_db_host
DB_PORT=5432
DB_NAME=pharezdb
DB_USER=pharezdb_user
DB_PASSWORD=your_secure_password
DB_SSL=true  # Required for cloud databases

# JWT Configuration
JWT_SECRET=generate_a_strong_random_secret_here
JWT_EXPIRES_IN=7d

# API Configuration
API_VERSION=v1

# Email Configuration (SendGrid or Gmail SMTP)
SENDGRID_API_KEY=your_sendgrid_api_key
EMAIL_FROM=your_verified_sender_email@example.com
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your_email@gmail.com
EMAIL_PASS=your_app_specific_password

# Third-party Integrations
TERMII_API_KEY=your_termii_api_key
TERMII_SENDER_ID=Pharez

# Remita Payment Configuration
REMITA_BASE_URL=https://demo.remita.net/remita/exapp/api/v1/send/api/echannelsvc
REMITA_MERCHANT_ID=your_merchant_id
REMITA_API_KEY=your_api_key
REMITA_SERVICE_TYPE_ID=your_service_type_id

# JED Integration
JED_BASE_URL=https://jedecosystem.com/map/api
JED_API_KEY=your_jed_api_key

# Default Values
DEFAULT_PASSWORD=SecureDefaultPassword123!
SINGLE_PHASE_METER_PRICE=135000
THREE_PHASE_METER_PRICE=209000
```

### 3.4 Generate Secure JWT Secret
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## Step 4: Database Migration & Seeding

### 4.1 Run Migrations
```bash
npm run migrate
```

This creates all required tables and schemas.

### 4.2 Seed Sample Data (Optional)
```bash
npm run seed
```

### 4.3 Create Super Admin User
```bash
npm run create-admin
```

Follow the interactive prompts to create an admin account.

---

## Step 5: Configure Process Manager

### 5.1 Install PM2 (Recommended)
```bash
sudo npm install -g pm2
```

### 5.2 Create PM2 Configuration File
```bash
nano ecosystem.config.js
```

Add the following:

```javascript
module.exports = {
  apps: [
    {
      name: 'pharez-api',
      script: './server.js',
      instances: 'max',
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production'
      },
      error_file: '/var/log/pharez-api/error.log',
      out_file: '/var/log/pharez-api/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      watch: false,
      ignore_watch: ['node_modules', 'logs'],
      max_memory_restart: '1G',
      restart_delay: 4000,
      kill_timeout: 5000,
      listen_timeout: 10000
    }
  ]
};
```

### 5.3 Start Application with PM2
```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

### 5.4 Verify Running Process
```bash
pm2 status
pm2 logs pharez-api
```

---

## Step 6: Web Server & Reverse Proxy (Nginx)

### 6.1 Install Nginx
```bash
# Ubuntu/Debian
sudo apt-get install -y nginx

# Start service
sudo systemctl start nginx
sudo systemctl enable nginx
```

### 6.2 Configure Nginx as Reverse Proxy
```bash
sudo nano /etc/nginx/sites-available/pharez-api
```

Add configuration:

```nginx
upstream pharez_app {
    server localhost:3000;
    server localhost:3001;  # Additional instances for load balancing
}

server {
    listen 80;
    server_name your-domain.com www.your-domain.com;

    # Redirect HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com www.your-domain.com;

    # SSL Certificates (use Let's Encrypt)
    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    # SSL Configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # Security Headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "DENY" always;

    # Gzip Compression
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml;
    gzip_min_length 1000;

    # Reverse Proxy
    location / {
        proxy_pass http://pharez_app;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # API Documentation
    location /api-docs {
        proxy_pass http://pharez_app/api-docs;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
    }
}
```

### 6.3 Enable Site & Test
```bash
sudo ln -s /etc/nginx/sites-available/pharez-api /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 6.4 Setup SSL with Let's Encrypt
```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot certonly --nginx -d your-domain.com -d www.your-domain.com
```

---

## Step 7: Firewall Configuration

```bash
# Enable UFW (Ubuntu/Debian)
sudo ufw enable

# Allow SSH
sudo ufw allow 22

# Allow HTTP & HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Allow PostgreSQL only from internal (if local DB)
sudo ufw allow from 192.168.x.x to any port 5432

# Check status
sudo ufw status
```

---

## Step 8: Monitoring & Logging

### 8.1 Setup Centralized Logging (Optional)
```bash
# View application logs
pm2 logs pharez-api

# View Nginx logs
tail -f /var/log/nginx/access.log
tail -f /var/log/nginx/error.log
```

### 8.2 Setup PM2 Monitoring
```bash
pm2 web  # Access at http://localhost:9615

# Or use PM2 Plus (cloud monitoring)
pm2 plus
```

### 8.3 Create Monitoring Script
```bash
#!/bin/bash
# monitor.sh

while true; do
    if ! pgrep -f "node ./server.js" > /dev/null; then
        echo "App crashed, restarting..."
        pm2 restart pharez-api
        # Send alert email
        echo "Pharez API crashed at $(date)" | mail -s "Pharez API Alert" admin@your-domain.com
    fi
    sleep 300  # Check every 5 minutes
done
```

---

## Step 9: Health Checks & Monitoring

### 9.1 Health Check Endpoint
The API includes a health check endpoint:
```
GET /health
```

Response:
```json
{
  "success": true,
  "message": "PharezAPI is running!",
  "data": {
    "timestamp": "2024-01-15T10:30:00.000Z",
    "version": "v1"
  }
}
```

### 9.2 Setup Uptime Monitoring
Use external services:
- Uptimerobot.com
- Pingdom
- Datadog
- New Relic

Configure to monitor: `https://your-domain.com/health`

---

## Step 10: Security Best Practices

### 10.1 Environment Security
- ✅ Use strong, random JWT_SECRET (minimum 32 characters)
- ✅ Store `.env` file outside git repository
- ✅ Restrict file permissions: `chmod 600 .env`
- ✅ Never commit `.env` to version control

### 10.2 Database Security
- ✅ Use strong database passwords (min 16 characters)
- ✅ Enable SSL for database connections
- ✅ Regular database backups (daily minimum)
- ✅ Restrict database access to API server only
- ✅ Use read-only user for backups if possible

### 10.3 API Security
- ✅ All traffic should be HTTPS only
- ✅ Implement rate limiting for API endpoints
- ✅ Use API keys for third-party integrations
- ✅ Implement CORS properly (specify allowed origins)
- ✅ Add request validation and sanitization
- ✅ Implement API request size limits (10MB currently)

### 10.4 Server Security
- ✅ Disable SSH password authentication (use keys only)
- ✅ Keep system packages updated regularly
- ✅ Setup automatic security updates
- ✅ Use firewall rules to restrict access
- ✅ Monitor system logs for suspicious activity
- ✅ Implement fail2ban for brute-force protection

---

## Step 11: Deployment Checklist

Before going live, verify:

- [ ] Node.js and npm installed and verified
- [ ] PostgreSQL running and accessible
- [ ] Database created with proper user and permissions
- [ ] `.env` file configured with production values
- [ ] Database migrations executed successfully
- [ ] Admin user created
- [ ] Application starts without errors: `npm start`
- [ ] Health check endpoint responding: `GET /health`
- [ ] All environment variables set correctly
- [ ] PM2/process manager configured and running
- [ ] Nginx configured as reverse proxy
- [ ] SSL certificate installed and working
- [ ] Firewall rules configured
- [ ] Database backups scheduled
- [ ] Monitoring and logging setup
- [ ] API documentation accessible at `/api-docs`
- [ ] Error handling and logging working
- [ ] Third-party service keys configured (Remita, JED, SendGrid, etc.)
- [ ] Database connection pooling configured
- [ ] Rate limiting implemented

---

## Step 12: Post-Deployment

### 12.1 Verify Deployment
```bash
# Check application status
pm2 status

# Test API endpoint
curl https://your-domain.com/health

# Check logs for errors
pm2 logs pharez-api
```

### 12.2 Configure CI/CD (Optional)
Setup automated deployments using:
- GitHub Actions
- GitLab CI/CD
- Jenkins
- CircleCI

Example GitHub Actions workflow for auto-deployment:
```yaml
name: Deploy to Production
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Deploy
        run: |
          ssh user@your-server "cd /opt/pharez-api && git pull && npm install && npm run migrate && pm2 restart pharez-api"
```

### 12.3 Setup Alerts & Notifications
- Database backup failures
- Application crashes
- High CPU/memory usage
- SSL certificate expiration (60+ days before)
- Disk space warnings

---

## Troubleshooting

### Issue: Database Connection Failed
```bash
# Test connection
psql -h $DB_HOST -U $DB_USER -d $DB_NAME

# Check connection string
grep DB_ .env

# Verify credentials
sudo -u postgres psql -c "SELECT usename FROM pg_user;"
```

### Issue: Port Already in Use
```bash
# Find process using port 3000
lsof -i :3000

# Kill process
kill -9 <PID>

# Or use different port in .env
```

### Issue: Permission Denied on .env
```bash
sudo chown $USER:$USER .env
chmod 600 .env
```

### Issue: Out of Memory
```bash
# Increase PM2 memory limit in ecosystem.config.js
max_memory_restart: '2G'

pm2 restart pharez-api
```

### Issue: SSL Certificate Expiration
```bash
# Check certificate expiration
openssl x509 -in /etc/letsencrypt/live/your-domain.com/fullchain.pem -noout -dates

# Renew certificate
sudo certbot renew
```

---

## Maintenance Tasks

### Daily
- Monitor application logs
- Check health endpoint
- Verify database backups completed

### Weekly
- Review error logs
- Check system resource usage
- Test database recovery procedures

### Monthly
- Review security logs
- Update npm packages: `npm audit`
- Test backup restoration
- Review API performance metrics

### Quarterly
- Security audit
- Capacity planning review
- Performance optimization
- Dependency updates

---

## Support & Documentation

- **API Documentation**: Available at `/api-docs` endpoint
- **GitHub Repository**: [Your repo URL]
- **Issue Tracking**: [Your issue tracking URL]
- **Contact**: [Support email/contact]

---

## Emergency Procedures

### Rollback Deployment
```bash
git revert <commit-hash>
npm install
npm run migrate
pm2 restart pharez-api
```

### Database Recovery
```bash
# Restore from backup
gunzip -c /var/backups/pharez-db/pharez_backup_YYYYMMDD_HHMMSS.sql.gz | \
  psql -h $DB_HOST -U $DB_USER $DB_NAME
```

### Hard Restart
```bash
pm2 stop pharez-api
# Clear any locks/temp files
rm -rf /tmp/pharez-*
pm2 start ecosystem.config.js
```

---

**Last Updated**: January 2024
**Version**: 1.0
**Maintained By**: [Your Team]
