# Deployment Guide

This guide covers deploying GraphMarket to production environments with best practices for security, scalability, and monitoring.

## Table of Contents

- [Deployment Overview](#deployment-overview)
- [Environment Setup](#environment-setup)
- [Docker Deployment](#docker-deployment)
- [Kubernetes Deployment](#kubernetes-deployment)
- [Cloud Platforms](#cloud-platforms)
- [Security Configuration](#security-configuration)
- [Monitoring & Logging](#monitoring--logging)
- [Performance Optimization](#performance-optimization)
- [Backup & Recovery](#backup--recovery)

## Deployment Overview

### Architecture Components

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Load Balancer │    │   GraphMarket   │    │    Database     │
│    (nginx)      │◄──►│   API Server    │◄──►│   (MongoDB)     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                │
                                ▼
                       ┌─────────────────┐
                       │     Cache       │
                       │    (Redis)      │
                       └─────────────────┘
```

### Deployment Environments

1. **Development**: Local development with hot reload
2. **Staging**: Production-like environment for testing
3. **Production**: Live environment serving real users

## Environment Setup

### Production Environment Variables

Create a production `.env` file:

```env
# === CORE CONFIGURATION ===
NODE_ENV=production
PORT=4000

# === DATABASE ===
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/graphmarket
MONGODB_TEST_URI=mongodb+srv://username:password@cluster.mongodb.net/graphmarket-test

# === CACHE ===
REDIS_URL=redis://username:password@redis-host:6379

# === SECURITY ===
JWT_SECRET=your-super-secure-256-bit-secret-key-here
CORS_ORIGIN=https://yourdomain.com,https://app.yourdomain.com

# === PERFORMANCE ===
ENABLE_QUERY_COMPLEXITY=true
MAX_QUERY_COMPLEXITY=1000
MAX_QUERY_DEPTH=15

# === RATE LIMITING ===
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
AUTH_RATE_LIMIT_MAX=5

# === LOGGING ===
LOG_LEVEL=info
LOG_FILE_PATH=/var/log/graphmarket/app.log

# === MONITORING ===
ENABLE_METRICS=true
METRICS_PORT=9090

# === EMAIL (Optional) ===
SMTP_HOST=smtp.yourdomain.com
SMTP_PORT=587
SMTP_USER=noreply@yourdomain.com
SMTP_PASS=your-smtp-password

# === STORAGE (Optional) ===
AWS_ACCESS_KEY_ID=your-aws-access-key
AWS_SECRET_ACCESS_KEY=your-aws-secret-key
AWS_REGION=us-east-1
S3_BUCKET=graphmarket-assets
```

### Security Checklist

- [ ] Use strong, unique JWT secret (256-bit minimum)
- [ ] Configure CORS for specific domains only
- [ ] Use HTTPS in production
- [ ] Enable rate limiting
- [ ] Set secure MongoDB credentials
- [ ] Use Redis AUTH if available
- [ ] Configure firewall rules
- [ ] Enable audit logging
- [ ] Regular security updates

## Docker Deployment

### Production Dockerfile

```dockerfile
# Multi-stage build for production
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy source code
COPY . .

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S graphmarket -u 1001

# === PRODUCTION STAGE ===
FROM node:20-alpine AS production

WORKDIR /app

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S graphmarket -u 1001

# Copy built application
COPY --from=builder --chown=graphmarket:nodejs /app .

# Create logs directory
RUN mkdir -p /var/log/graphmarket && \
    chown graphmarket:nodejs /var/log/graphmarket

# Switch to non-root user
USER graphmarket

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node scripts/healthcheck.js

# Expose port
EXPOSE 4000

# Start application
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "src/index.js"]
```

### Docker Compose for Production

```yaml
version: '3.8'

services:
  graphmarket:
    build:
      context: .
      target: production
    ports:
      - "4000:4000"
    environment:
      - NODE_ENV=production
    env_file:
      - .env.production
    depends_on:
      - mongodb
      - redis
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "node", "scripts/healthcheck.js"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"

  mongodb:
    image: mongo:7.0
    environment:
      MONGO_INITDB_ROOT_USERNAME: ${MONGO_ROOT_USER}
      MONGO_INITDB_ROOT_PASSWORD: ${MONGO_ROOT_PASSWORD}
      MONGO_INITDB_DATABASE: graphmarket
    volumes:
      - mongodb_data:/data/db
      - ./scripts/mongo-init.js:/docker-entrypoint-initdb.d/mongo-init.js:ro
    restart: unless-stopped
    command: mongod --auth --bind_ip_all

  redis:
    image: redis:7.2-alpine
    command: redis-server --requirepass ${REDIS_PASSWORD}
    volumes:
      - redis_data:/data
    restart: unless-stopped

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./ssl:/etc/nginx/ssl:ro
    depends_on:
      - graphmarket
    restart: unless-stopped

volumes:
  mongodb_data:
  redis_data:
```

### Health Check Script

Create `scripts/healthcheck.js`:

```javascript
const http = require('http');

const options = {
  hostname: 'localhost',
  port: process.env.PORT || 4000,
  path: '/health',
  method: 'GET',
  timeout: 3000
};

const req = http.request(options, (res) => {
  if (res.statusCode === 200) {
    process.exit(0);
  } else {
    process.exit(1);
  }
});

req.on('error', () => {
  process.exit(1);
});

req.on('timeout', () => {
  req.destroy();
  process.exit(1);
});

req.end();
```

## Kubernetes Deployment

### Kubernetes Manifests

**Namespace:**
```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: graphmarket
```

**ConfigMap:**
```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: graphmarket-config
  namespace: graphmarket
data:
  NODE_ENV: "production"
  PORT: "4000"
  LOG_LEVEL: "info"
  ENABLE_QUERY_COMPLEXITY: "true"
  MAX_QUERY_COMPLEXITY: "1000"
  MAX_QUERY_DEPTH: "15"
```

**Secret:**
```yaml
apiVersion: v1
kind: Secret
metadata:
  name: graphmarket-secrets
  namespace: graphmarket
type: Opaque
data:
  JWT_SECRET: <base64-encoded-secret>
  MONGODB_URI: <base64-encoded-uri>
  REDIS_URL: <base64-encoded-url>
```

**Deployment:**
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: graphmarket
  namespace: graphmarket
spec:
  replicas: 3
  selector:
    matchLabels:
      app: graphmarket
  template:
    metadata:
      labels:
        app: graphmarket
    spec:
      containers:
      - name: graphmarket
        image: graphmarket:latest
        ports:
        - containerPort: 4000
        envFrom:
        - configMapRef:
            name: graphmarket-config
        - secretRef:
            name: graphmarket-secrets
        livenessProbe:
          httpGet:
            path: /health
            port: 4000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /ready
            port: 4000
          initialDelaySeconds: 5
          periodSeconds: 5
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"
```

**Service:**
```yaml
apiVersion: v1
kind: Service
metadata:
  name: graphmarket-service
  namespace: graphmarket
spec:
  selector:
    app: graphmarket
  ports:
  - port: 80
    targetPort: 4000
  type: ClusterIP
```

**Ingress:**
```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: graphmarket-ingress
  namespace: graphmarket
  annotations:
    kubernetes.io/ingress.class: nginx
    cert-manager.io/cluster-issuer: letsencrypt-prod
spec:
  tls:
  - hosts:
    - api.yourdomain.com
    secretName: graphmarket-tls
  rules:
  - host: api.yourdomain.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: graphmarket-service
            port:
              number: 80
```

## Cloud Platforms

### AWS Deployment

**Using AWS ECS with Fargate:**

1. **Create ECS Cluster**
```bash
aws ecs create-cluster --cluster-name graphmarket-cluster
```

2. **Task Definition**
```json
{
  "family": "graphmarket",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "512",
  "memory": "1024",
  "executionRoleArn": "arn:aws:iam::account:role/ecsTaskExecutionRole",
  "containerDefinitions": [
    {
      "name": "graphmarket",
      "image": "your-account.dkr.ecr.region.amazonaws.com/graphmarket:latest",
      "portMappings": [
        {
          "containerPort": 4000,
          "protocol": "tcp"
        }
      ],
      "environment": [
        {"name": "NODE_ENV", "value": "production"},
        {"name": "PORT", "value": "4000"}
      ],
      "secrets": [
        {
          "name": "JWT_SECRET",
          "valueFrom": "arn:aws:secretsmanager:region:account:secret:graphmarket/jwt-secret"
        }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/graphmarket",
          "awslogs-region": "us-east-1",
          "awslogs-stream-prefix": "ecs"
        }
      }
    }
  ]
}
```

3. **Application Load Balancer**
```bash
aws elbv2 create-load-balancer \
  --name graphmarket-alb \
  --subnets subnet-12345 subnet-67890 \
  --security-groups sg-12345
```

### Google Cloud Platform

**Using Cloud Run:**

```yaml
apiVersion: serving.knative.dev/v1
kind: Service
metadata:
  name: graphmarket
  annotations:
    run.googleapis.com/ingress: all
spec:
  template:
    metadata:
      annotations:
        autoscaling.knative.dev/maxScale: "10"
        run.googleapis.com/cpu-throttling: "false"
    spec:
      containerConcurrency: 100
      containers:
      - image: gcr.io/project-id/graphmarket:latest
        ports:
        - containerPort: 4000
        env:
        - name: NODE_ENV
          value: production
        - name: JWT_SECRET
          valueFrom:
            secretKeyRef:
              name: graphmarket-secrets
              key: jwt-secret
        resources:
          limits:
            cpu: 1000m
            memory: 512Mi
```

### Azure Deployment

**Using Azure Container Instances:**

```bash
az container create \
  --resource-group graphmarket-rg \
  --name graphmarket \
  --image graphmarket:latest \
  --dns-name-label graphmarket \
  --ports 4000 \
  --environment-variables NODE_ENV=production \
  --secure-environment-variables JWT_SECRET=your-secret
```

## Security Configuration

### SSL/TLS Setup

**Nginx Configuration:**
```nginx
server {
    listen 80;
    server_name api.yourdomain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name api.yourdomain.com;

    ssl_certificate /etc/nginx/ssl/cert.pem;
    ssl_certificate_key /etc/nginx/ssl/key.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512;
    ssl_prefer_server_ciphers off;

    location / {
        proxy_pass http://graphmarket:4000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Firewall Rules

**UFW (Ubuntu):**
```bash
# Allow SSH
ufw allow 22

# Allow HTTP and HTTPS
ufw allow 80
ufw allow 443

# Allow application port (if directly exposed)
ufw allow 4000

# Enable firewall
ufw enable
```

### Database Security

**MongoDB Security:**
```javascript
// Create application user
use graphmarket
db.createUser({
  user: "graphmarket",
  pwd: "secure-password",
  roles: [
    { role: "readWrite", db: "graphmarket" },
    { role: "read", db: "graphmarket_test" }
  ]
})

// Enable authentication
// Add to mongod.conf:
security:
  authorization: enabled
```

## Monitoring & Logging

### Application Monitoring

**Prometheus Configuration:**
```yaml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'graphmarket'
    static_configs:
      - targets: ['graphmarket:9090']
    metrics_path: '/metrics'
```

**Grafana Dashboard:**
```json
{
  "dashboard": {
    "title": "GraphMarket Metrics",
    "panels": [
      {
        "title": "Request Rate",
        "type": "graph",
        "targets": [
          {
            "expr": "rate(http_requests_total[5m])",
            "legendFormat": "{{method}} {{route}}"
          }
        ]
      },
      {
        "title": "Response Time",
        "type": "graph",
        "targets": [
          {
            "expr": "histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))",
            "legendFormat": "95th percentile"
          }
        ]
      }
    ]
  }
}
```

### Centralized Logging

**ELK Stack Configuration:**

**Logstash Configuration:**
```yaml
input {
  beats {
    port => 5044
  }
}

filter {
  if [fields][service] == "graphmarket" {
    json {
      source => "message"
    }
    
    date {
      match => [ "timestamp", "ISO8601" ]
    }
  }
}

output {
  elasticsearch {
    hosts => ["elasticsearch:9200"]
    index => "graphmarket-%{+YYYY.MM.dd}"
  }
}
```

### Health Monitoring

**Health Check Endpoint:**
```javascript
// Add to your Express app
app.get('/health', async (req, res) => {
  const health = {
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env.npm_package_version,
    checks: {
      mongodb: await checkMongoDB(),
      redis: await checkRedis(),
      memory: checkMemory()
    }
  };

  const isHealthy = Object.values(health.checks).every(check => check.status === 'OK');
  
  res.status(isHealthy ? 200 : 503).json(health);
});
```

## Performance Optimization

### Production Optimizations

**PM2 Configuration:**
```javascript
// ecosystem.config.js
module.exports = {
  apps: [{
    name: 'graphmarket',
    script: 'src/index.js',
    instances: 'max',
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 4000
    },
    error_file: '/var/log/pm2/graphmarket-error.log',
    out_file: '/var/log/pm2/graphmarket-out.log',
    log_file: '/var/log/pm2/graphmarket.log',
    time: true,
    max_memory_restart: '1G',
    node_args: '--max-old-space-size=1024'
  }]
};
```

**Caching Headers:**
```javascript
// Add caching middleware
app.use('/graphql', (req, res, next) => {
  if (req.method === 'GET') {
    res.set('Cache-Control', 'public, max-age=300'); // 5 minutes
  }
  next();
});
```

### Database Optimization

**MongoDB Indexes:**
```javascript
// Create performance indexes
db.products.createIndex({ category: 1, price: 1 });
db.products.createIndex({ name: "text", description: "text" });
db.orders.createIndex({ user: 1, createdAt: -1 });
db.users.createIndex({ email: 1 }, { unique: true });
```

**Connection Pooling:**
```javascript
const mongooseOptions = {
  maxPoolSize: 10,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
  bufferMaxEntries: 0,
  bufferCommands: false
};
```

## Backup & Recovery

### Database Backup

**Automated MongoDB Backup:**
```bash
#!/bin/bash
# backup-mongodb.sh

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backups/mongodb"
DB_NAME="graphmarket"

# Create backup directory
mkdir -p $BACKUP_DIR

# Perform backup
mongodump --uri="$MONGODB_URI" --db=$DB_NAME --out=$BACKUP_DIR/$DATE

# Compress backup
tar -czf $BACKUP_DIR/graphmarket_$DATE.tar.gz -C $BACKUP_DIR $DATE

# Remove uncompressed backup
rm -rf $BACKUP_DIR/$DATE

# Keep only last 7 days of backups
find $BACKUP_DIR -name "graphmarket_*.tar.gz" -mtime +7 -delete

echo "Backup completed: graphmarket_$DATE.tar.gz"
```

**Backup Cron Job:**
```bash
# Add to crontab
0 2 * * * /scripts/backup-mongodb.sh >> /var/log/backup.log 2>&1
```

### Disaster Recovery

**Recovery Procedure:**

1. **Stop Application**
```bash
docker-compose down
```

2. **Restore Database**
```bash
# Extract backup
tar -xzf graphmarket_20231215_020000.tar.gz

# Restore database
mongorestore --uri="$MONGODB_URI" --db=graphmarket graphmarket_20231215_020000/graphmarket
```

3. **Verify Data Integrity**
```bash
# Check document counts
mongo $MONGODB_URI --eval "db.users.count(); db.products.count(); db.orders.count();"
```

4. **Restart Application**
```bash
docker-compose up -d
```

### Monitoring Recovery

**Recovery Time Objective (RTO)**: < 1 hour
**Recovery Point Objective (RPO)**: < 24 hours (daily backups)

## Deployment Checklist

### Pre-Deployment

- [ ] Environment variables configured
- [ ] SSL certificates installed
- [ ] Database migrations applied
- [ ] Security configurations verified
- [ ] Load balancer configured
- [ ] Monitoring setup complete
- [ ] Backup procedures tested

### Post-Deployment

- [ ] Health checks passing
- [ ] API endpoints responding
- [ ] Database connectivity verified
- [ ] Cache functioning properly
- [ ] Logs being generated
- [ ] Metrics being collected
- [ ] Performance benchmarks met
- [ ] Security scan completed

This comprehensive deployment guide ensures GraphMarket can be deployed securely and reliably in production environments with proper monitoring, backup, and recovery procedures. 