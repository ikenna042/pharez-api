# Pharez API - Deployment Requirements & System Specifications

## Quick Reference

| Component | Requirement | Recommended |
|-----------|-------------|-------------|
| **Node.js** | v18.0.0+ | Latest LTS (v20+) |
| **npm** | v8.0.0+ | Latest |
| **PostgreSQL** | v12.0+ | v14+ |
| **OS** | Linux/Ubuntu 18+ | Ubuntu 22.04 LTS |
| **RAM** | 2GB minimum | 4GB+ |
| **CPU** | 2+ cores | 4+ cores |
| **Storage** | 20GB+ | 50GB+ SSD |
| **Disk I/O** | Standard | SSD (recommended) |

---

## Hardware Requirements

### Minimum Configuration (Small Deployments)
- **CPU**: 2 vCPU
- **RAM**: 2GB
- **Storage**: 20GB SSD
- **Network**: 1Mbps upload/download
- **Expected Users**: Up to 100 concurrent

### Recommended Configuration (Production)
- **CPU**: 4 vCPU
- **RAM**: 8GB (4GB app + 4GB database cache)
- **Storage**: 100GB SSD
- **Network**: 10Mbps+ dedicated
- **Expected Users**: 500+ concurrent

### High-Scale Configuration
- **CPU**: 8+ vCPU (or auto-scaling)
- **RAM**: 16GB+
- **Storage**: 500GB+ SSD
- **Database**: Managed cloud PostgreSQL with read replicas
- **Expected Users**: 1000+ concurrent with load balancing

---

## Software Dependencies

### Core Dependencies
```json
{
  "express": "^5.1.0",           // Web framework
  "pg": "^8.16.3",               // PostgreSQL driver
  "knex": "^3.1.0",              // Query builder
  "jsonwebtoken": "^9.0.2",      // JWT authentication
  "bcryptjs": "^3.0.2",          // Password hashing
  "joi": "^18.0.1",              // Input validation
  "cors": "^2.8.5",              // CORS support
  "helmet": "^8.1.0",            // Security headers
  "morgan": "^1.10.1",           // HTTP logging
  "dotenv": "^17.2.2",           // Environment variables
  "multer": "^2.0.2",            // File uploads
  "swagger-jsdoc": "^6.2.8",     // API documentation
  "swagger-ui-express": "^5.0.1",// Swagger UI
  "axios": "^1.11.0",            // HTTP client
  "@sendgrid/mail": "^8.1.5",    // Email service
  "nodemailer": "^7.0.6",        // Email alternative
  "xlsx": "^0.18.5"              // Excel file handling
}
```

### Development Dependencies
```json
{
  "nodemon": "^3.1.10",          // Auto-reload during development
  "jest": "^30.1.3",             // Testing framework
  "supertest": "^7.1.4"          // HTTP assertions
}
```

### Global Tools
- **pm2**: Process manager (production)
- **nginx**: Reverse proxy (production)
- **certbot**: SSL certificate management

---

## Database Requirements

### PostgreSQL Configuration

#### Minimum Settings
```sql
-- Max connections for 2GB RAM
max_connections = 100

-- Shared buffers (1/4 of RAM)
shared_buffers = 512MB

-- Effective cache size (1/2 of RAM)
effective_cache_size = 1GB

-- Work memory per operation
work_mem = 4MB
```

#### Recommended Settings
```sql
-- For 8GB RAM with 4GB allocated to DB
max_connections = 200

shared_buffers = 2GB

effective_cache_size = 4GB

work_mem = 10MB

maintenance_work_mem = 512MB

-- Connection pooling
max_pool_size = 20
```

### Database Sizing

| Usage Level | Estimated DB Size | Monthly Growth |
|------------|-------------------|-----------------|
| Low (<100 users) | 100MB | 10MB |
| Medium (100-1000 users) | 1GB | 50MB |
| High (1000-10k users) | 10GB | 500MB |
| Enterprise (10k+ users) | 50GB+ | 5GB+ |

---

## Network & Firewall Configuration

### Required Ports

| Port | Service | Direction | Protocol | Notes |
|------|---------|-----------|----------|-------|
| 22 | SSH | Inbound | TCP | Administrative access only |
| 80 | HTTP | Inbound | TCP | Auto-redirect to HTTPS |
| 443 | HTTPS | Inbound | TCP | Primary API access |
| 5432 | PostgreSQL | Internal | TCP | Database (internal only) |
| 9615 | PM2 Web | Internal | TCP | Monitoring (internal only) |

### Firewall Rules (UFW Example)
```bash
# SSH - restrict to specific IPs
sudo ufw allow from 203.0.113.0/24 to any port 22

# HTTPS - allow worldwide
sudo ufw allow 443/tcp

# HTTP - redirect to HTTPS
sudo ufw allow 80/tcp

# PostgreSQL - internal only
sudo ufw allow from 192.168.0.0/16 to any port 5432

# Deny all other inbound
sudo ufw default deny incoming
```

---

## Environment Variables Required

### Authentication
```env
JWT_SECRET=<64-char-random-string>
JWT_EXPIRES_IN=7d
DEFAULT_PASSWORD=<secure-password>
```

### Database
```env
DB_HOST=<hostname-or-ip>
DB_PORT=5432
DB_NAME=pharezdb
DB_USER=pharezdb_user
DB_PASSWORD=<secure-password>
DB_SSL=true  # For cloud databases
```

### Email Service (Choose one)
**SendGrid:**
```env
SENDGRID_API_KEY=<your-api-key>
EMAIL_FROM=noreply@your-domain.com
```

**Gmail SMTP:**
```env
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=<app-specific-password>
EMAIL_FROM=Pharez <your-email@gmail.com>
```

### Third-Party Integrations
```env
# Remita Payment Gateway
REMITA_BASE_URL=https://demo.remita.net/remita/exapp/api/v1/send/api/echannelsvc
REMITA_MERCHANT_ID=<merchant-id>
REMITA_API_KEY=<api-key>
REMITA_SERVICE_TYPE_ID=<service-id>

# JED Integration
JED_BASE_URL=https://jedecosystem.com/map/api
JED_API_KEY=<api-key>

# SMS Service
TERMII_API_KEY=<api-key>
TERMII_SENDER_ID=Pharez
```

### Application Configuration
```env
NODE_ENV=production
PORT=3000
API_VERSION=v1
SINGLE_PHASE_METER_PRICE=135000
THREE_PHASE_METER_PRICE=209000
```

---

## SSL/TLS Requirements

### Certificate Options
1. **Let's Encrypt** (Free, recommended)
   - Auto-renewal available via Certbot
   - Valid for 90 days
   - Installation: See deployment guide

2. **Commercial Certificate**
   - DigiCert, GlobalSign, Comodo, etc.
   - Manual management required
   - Consider with auto-renewal service

3. **Self-signed** (Development only)
   - Not recommended for production
   - Browser warnings

### Minimum SSL Configuration
```nginx
ssl_protocols TLSv1.2 TLSv1.3;
ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256;
ssl_prefer_server_ciphers on;
add_header Strict-Transport-Security "max-age=31536000" always;
```

---

## Backup & Disaster Recovery

### Backup Requirements
- **Frequency**: Daily (minimum)
- **Retention**: 30 days (minimum)
- **Location**: Off-site or cloud storage
- **Recovery RTO**: 4 hours
- **Recovery RPO**: 24 hours

### Backup Storage Options
1. **Local + Cloud Backup**
   - Primary: NAS/external storage
   - Secondary: AWS S3, Google Cloud Storage, Azure Blob

2. **Managed Database Backups**
   - AWS RDS automated backups
   - Google Cloud SQL automated backups
   - Render/Neon managed backups

3. **Storage Requirements**
   - Daily backup: ~500MB (small deployment)
   - Monthly retention: ~15GB

---

## Performance Specifications

### Expected API Response Times
| Endpoint | Target | Max |
|----------|--------|-----|
| Health check | <50ms | 100ms |
| Authentication | <200ms | 500ms |
| CRUD operations | <500ms | 1000ms |
| File uploads | <2s | 5s |
| Meter operations | <500ms | 1000ms |

### Throughput Capacity
- **Requests/sec (1 instance)**: 50-100 RPS
- **Concurrent connections**: 100-200
- **Database connections**: 20 (pool size)
- **Scalable to 500+ RPS** with load balancing

---

## Load Balancing & Scaling

### Horizontal Scaling
For multiple instances:
```
    Load Balancer (Nginx/HAProxy)
          |
    ______+_____
    |    |    |
   App1 App2 App3
    \___________/
         |
      Database
```

### Auto-scaling Configuration (Optional)
- Min instances: 2
- Max instances: 10
- CPU threshold: 70%
- Memory threshold: 80%
- Scale up: +2 instances
- Scale down: -1 instance (after 5 min idle)

---

## Monitoring & Logging

### Log Aggregation Options
1. **Built-in**: PM2 logs + Nginx logs
2. **ELK Stack**: Elasticsearch, Logstash, Kibana
3. **Managed**: Datadog, New Relic, Sumologic
4. **Cloud**: CloudWatch (AWS), Stackdriver (GCP)

### Metrics to Monitor
- CPU usage (target: <70%)
- Memory usage (target: <80%)
- Disk space (alert at 80% full)
- Database connections (pool: 20)
- Response times (p95 < 1s)
- Error rate (target: <0.1%)
- API request rate
- Database query performance

### Alert Thresholds
| Metric | Warning | Critical |
|--------|---------|----------|
| CPU | >70% | >90% |
| Memory | >75% | >90% |
| Disk | >80% | >95% |
| DB Connections | >15/20 | >18/20 |
| Error Rate | >1% | >5% |
| Response Time (p95) | >1s | >2s |

---

## Compliance & Security

### Security Standards
- HTTPS/TLS 1.2+ (mandatory)
- CORS properly configured
- CSRF protection (via token validation)
- SQL injection prevention (parameterized queries)
- Rate limiting on authentication endpoints
- Strong password hashing (bcryptjs)
- JWT token expiration (7 days)

### Data Protection
- Database backups encrypted
- Environment variables secured
- Secrets not in version control
- SSH key-based access only
- Regular security audits
- Dependency vulnerability scanning (npm audit)

### Compliance Considerations
- **GDPR**: If handling EU user data
- **PCI-DSS**: If processing payments
- **HIPAA**: If handling health data
- **SOC2**: For enterprise clients

---

## Deployment Verification Checklist

```bash
# System Check
node --version                    # Should be v18+
npm --version                     # Should be v8+
psql --version                    # Should be v12+

# Application Check
npm install                       # Install dependencies
npm run migrate                   # Run database migrations
npm run seed                      # Seed sample data (optional)
npm run create-admin              # Create admin user

# Start Application
npm start                         # Should start without errors

# Verify Endpoints
curl http://localhost:3000/health
curl http://localhost:3000/api-docs
```

### Expected Startup Time: <10 seconds

---

## Cost Estimation

### Self-Hosted Option
- VPS: $10-50/month (2GB RAM, 2 CPU)
- Database (self-hosted): Included
- Domain: $10-15/year
- SSL: Free (Let's Encrypt)
- Backups: Storage $5-20/month
- **Total: $25-70/month**

### Managed Cloud Option
- App Server: $50-100/month
- Managed Database: $50-150/month
- CDN: $0-50/month (optional)
- Monitoring: $0-100/month (optional)
- **Total: $100-400/month**

---

## Timeline for Deployment

- **Planning & Preparation**: 2-3 days
- **Server Setup**: 1-2 days
- **Database Configuration**: 1 day
- **Application Deployment**: 1 day
- **Testing & Verification**: 2-3 days
- **Documentation & Handover**: 1 day
- **Total Estimated Time**: 1-2 weeks

---

## Support Contacts

| Issue | Contact | Response Time |
|-------|---------|----------------|
| Application Error | Development Team | 4 hours |
| Database Issue | Database Admin | 2 hours |
| Server Issue | DevOps Team | 1 hour |
| Security Issue | Security Team | 30 minutes |
| Network Issue | Network Admin | 2 hours |

---

**Document Version**: 1.0  
**Last Updated**: January 2024  
**Next Review**: April 2024
