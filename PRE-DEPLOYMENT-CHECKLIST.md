# Pre-Deployment Checklist

Use this checklist to ensure all requirements are met before deploying to production.

## Phase 1: Planning & Preparation (Days 1-3)

### Infrastructure Planning
- [ ] Decide on hosting option (self-hosted vs managed cloud)
- [ ] Choose server location/region
- [ ] Determine scaling strategy
- [ ] Plan backup strategy
- [ ] Document disaster recovery procedures
- [ ] Allocate budget for infrastructure
- [ ] Identify responsible team members

### Domain & SSL
- [ ] Register domain name
- [ ] Point DNS to server IP
- [ ] Obtain SSL certificate (Let's Encrypt or commercial)
- [ ] Test certificate installation
- [ ] Setup automatic certificate renewal
- [ ] Configure HTTPS redirects

### Access & Security
- [ ] Generate SSH keys for team members
- [ ] Create deployment user account
- [ ] Setup sudo privileges
- [ ] Generate strong JWT secret (32+ characters)
- [ ] Generate strong database password (16+ characters)
- [ ] Create credentials vault/document (secure access)

### Third-Party Services
- [ ] Obtain Remita merchant account (production credentials)
- [ ] Obtain JED API key
- [ ] Setup SendGrid account and verify sender email
- [ ] Setup Termii account for SMS
- [ ] Test all API credentials locally
- [ ] Document API endpoints and rate limits

---

## Phase 2: Server Setup (Days 4-5)

### Operating System
- [ ] Select OS (Ubuntu 22.04 LTS recommended)
- [ ] Install updates: `sudo apt update && sudo apt upgrade -y`
- [ ] Configure timezone: `sudo timedatectl set-timezone UTC`
- [ ] Enable automatic security updates
- [ ] Disable unnecessary services
- [ ] Setup log rotation

### Node.js & npm
- [ ] Install Node.js v18+ (use NodeSource repository)
- [ ] Verify installation: `node --version` (should be v18+)
- [ ] Verify npm: `npm --version` (should be v8+)
- [ ] Install global tools:
  - [ ] `sudo npm install -g pm2`
  - [ ] `sudo npm install -g nvm` (optional)

### PostgreSQL Database
- [ ] Install PostgreSQL v12+ (or verify cloud DB access)
- [ ] Create database: `pharezdb`
- [ ] Create database user: `pharezdb_user`
- [ ] Grant permissions to user
- [ ] Test local connection
- [ ] Verify SSL configuration (if cloud DB)
- [ ] Setup pgAdmin or DBeaver for database management (optional)
- [ ] Configure max_connections and shared_buffers
- [ ] Enable slow query logging

### Firewall Configuration
- [ ] Enable UFW: `sudo ufw enable`
- [ ] Allow SSH: `sudo ufw allow 22`
- [ ] Allow HTTP: `sudo ufw allow 80`
- [ ] Allow HTTPS: `sudo ufw allow 443`
- [ ] Block PostgreSQL from external (if applicable)
- [ ] Verify firewall status: `sudo ufw status`
- [ ] Test from external machine

### Nginx Web Server
- [ ] Install Nginx: `sudo apt-get install nginx`
- [ ] Create Nginx config for reverse proxy
- [ ] Test Nginx config: `sudo nginx -t`
- [ ] Enable Nginx to start on boot
- [ ] Setup SSL certificates
- [ ] Configure security headers
- [ ] Test HTTP → HTTPS redirect
- [ ] Setup gzip compression

---

## Phase 3: Application Setup (Days 6-7)

### Clone Repository
- [ ] Create deployment directory: `/opt/pharez-api`
- [ ] Clone repository: `git clone <repo-url>`
- [ ] Verify git history is intact
- [ ] Create .env file from .env.example
- [ ] Set proper file permissions: `chmod 600 .env`

### Environment Configuration
- [ ] Copy database credentials to .env
- [ ] Set JWT_SECRET: (generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`)
- [ ] Configure email service (SendGrid or SMTP)
- [ ] Add Remita credentials
- [ ] Add JED API key
- [ ] Add Termii SMS key
- [ ] Set NODE_ENV=production
- [ ] Configure PORT if needed
- [ ] Verify all 40+ environment variables are set
- [ ] Test connection to external services:
  - [ ] Test SendGrid key
  - [ ] Test Remita credentials
  - [ ] Test JED API key
  - [ ] Test Termii key

### Install Dependencies
- [ ] Run: `npm install --production`
- [ ] Verify no critical vulnerabilities: `npm audit`
- [ ] Fix any critical security issues
- [ ] Verify node_modules installed correctly
- [ ] Test require of main dependencies

### Database Migrations
- [ ] Run migrations: `npm run migrate`
- [ ] Verify all tables created:
  - [ ] users table
  - [ ] api_keys table
  - [ ] jed_customer_requests table
  - [ ] meters table
  - [ ] settings table
  - [ ] Check all indexes created
- [ ] Verify no migration errors in logs
- [ ] Take database backup after migration

### Application Initialization
- [ ] Seed database (optional): `npm run seed`
- [ ] Create admin user: `npm run create-admin`
- [ ] Verify admin account in database
- [ ] Test API endpoints manually
- [ ] Verify Swagger docs are accessible
- [ ] Check all routes are loaded

### PM2 Process Manager
- [ ] Create ecosystem.config.js
- [ ] Configure max_memory_restart
- [ ] Configure error and output log paths
- [ ] Start with PM2: `pm2 start ecosystem.config.js`
- [ ] Verify running: `pm2 status`
- [ ] Setup PM2 startup hooks: `pm2 startup && pm2 save`
- [ ] Test process restarts on crash
- [ ] Configure PM2 monitoring (optional)

---

## Phase 4: Testing & Verification (Days 8-10)

### Health Checks
- [ ] Test health endpoint: `curl https://your-domain.com/health`
- [ ] Verify response time < 100ms
- [ ] Check logs for errors
- [ ] Test from multiple external locations

### API Functionality
- [ ] Test authentication endpoint (POST /api/v1/auth/login)
- [ ] Test user creation endpoint
- [ ] Test API key endpoints
- [ ] Test meter endpoints
- [ ] Test file upload functionality
- [ ] Test all CRUD operations
- [ ] Verify response codes are correct
- [ ] Verify error messages are clear
- [ ] Test input validation
- [ ] Test rate limiting (if implemented)

### Database Operations
- [ ] Verify database connection pooling working
- [ ] Monitor active connections
- [ ] Test query performance
- [ ] Verify indexes are being used
- [ ] Test database failover (if applicable)
- [ ] Verify data integrity after operations

### Security Tests
- [ ] Test HTTPS only enforcement
- [ ] Verify SSL/TLS certificate chain
- [ ] Test CORS headers (should specify allowed origins)
- [ ] Test JWT token expiration
- [ ] Verify sensitive data not logged
- [ ] Test authentication bypasses (should fail)
- [ ] Test API key validation
- [ ] Verify no default credentials exposed

### Performance Tests
- [ ] Load test with 50+ concurrent users
- [ ] Measure average response time
- [ ] Measure p95 response time
- [ ] Monitor CPU during load test
- [ ] Monitor memory during load test
- [ ] Monitor database connections during load test
- [ ] Test with expected peak load
- [ ] Verify graceful degradation under load

### Backup & Recovery
- [ ] Take test database backup
- [ ] Verify backup file is not corrupted
- [ ] Test database restore procedure
- [ ] Document restore procedure
- [ ] Setup automated daily backups
- [ ] Verify backup schedule is working
- [ ] Test backup restoration works
- [ ] Document backup retention policy

### Logging & Monitoring
- [ ] Verify application logs are captured
- [ ] Verify error logs contain stack traces
- [ ] Setup log rotation to prevent disk fill
- [ ] Verify Nginx logs are captured
- [ ] Setup centralized logging (optional)
- [ ] Setup uptime monitoring
- [ ] Configure alert emails for errors
- [ ] Setup performance monitoring

---

## Phase 5: Documentation & Handover (Days 11)

### Documentation
- [ ] Create system architecture diagram
- [ ] Document all environment variables
- [ ] Document deployment procedure
- [ ] Document backup procedures
- [ ] Document disaster recovery procedures
- [ ] Document monitoring setup
- [ ] Create runbook for common issues
- [ ] Document API endpoints
- [ ] Create admin user guide
- [ ] Create incident response procedures

### Team Training
- [ ] Train ops team on PM2 commands
- [ ] Train ops team on database operations
- [ ] Train ops team on backup/restore procedures
- [ ] Train dev team on deployment procedures
- [ ] Create on-call rotation schedule
- [ ] Document escalation procedures
- [ ] Setup Slack/email notifications for alerts

### Credentials & Access
- [ ] Securely distribute .env file (encrypted)
- [ ] Securely distribute SSH keys
- [ ] Securely distribute admin credentials
- [ ] Setup password manager for team
- [ ] Document access procedures
- [ ] Setup audit logging for credential access
- [ ] Verify all team members have required access

### Final Verification
- [ ] Do final health check
- [ ] Verify all services running
- [ ] Review logs for errors
- [ ] Verify backups are working
- [ ] Verify monitoring alerts working
- [ ] Verify team has all documentation
- [ ] Verify incident response plan is ready
- [ ] Get sign-off from stakeholders

---

## Post-Deployment (Ongoing)

### Day 1 (Immediate)
- [ ] Monitor application logs closely
- [ ] Monitor error rates
- [ ] Monitor performance metrics
- [ ] Be ready to rollback if needed
- [ ] Have team on standby

### Week 1
- [ ] Monitor for any hidden issues
- [ ] Verify automated backups running
- [ ] Review monitoring alerts
- [ ] Tune performance if needed
- [ ] Update documentation with lessons learned

### Monthly
- [ ] Review security logs
- [ ] Run npm audit and update dependencies
- [ ] Review performance trends
- [ ] Test backup restoration
- [ ] Review monitoring alerts for patterns
- [ ] Plan capacity upgrades if needed

### Quarterly
- [ ] Security audit
- [ ] Performance optimization
- [ ] Dependency updates
- [ ] Review disaster recovery procedures
- [ ] Capacity planning review

---

## Rollback Procedure (If Needed)

If critical issues occur, follow this procedure:

```bash
# 1. Stop application
pm2 stop pharez-api

# 2. Revert code changes
cd /opt/pharez-api
git revert <commit-hash>
npm install

# 3. Restore database backup
gunzip -c /var/backups/pharez-db/pharez_backup_YYYYMMDD.sql.gz | \
  psql -h $DB_HOST -U $DB_USER $DB_NAME

# 4. Restart application
pm2 restart pharez-api

# 5. Verify
curl https://your-domain.com/health

# 6. Notify stakeholders
```

**Estimated Rollback Time**: 15-30 minutes

---

## Critical Contacts

| Role | Name | Phone | Email |
|------|------|-------|-------|
| DevOps Lead | | | |
| Database Admin | | | |
| Security Lead | | | |
| Application Lead | | | |
| Project Manager | | | |

---

## Sign-Off

- [ ] Infrastructure Team Sign-Off: _________________ Date: _______
- [ ] Security Team Sign-Off: _________________ Date: _______
- [ ] Development Team Sign-Off: _________________ Date: _______
- [ ] Project Manager Sign-Off: _________________ Date: _______

**Production Deployment Approved**: YES __ / NO __

---

**Deployment Date**: ________________
**Deployed By**: ________________
**Verified By**: ________________
**Notes**: 

---

Last Updated: January 2024
