# Self-Hosting Guide

This guide explains how to deploy SkillHub on your own server.

## Prerequisites

- Docker and Docker Compose
- A server with at least 2GB RAM and 10GB disk space
- A domain name (optional, but recommended)
- GitHub Personal Access Token (for indexing skills)

## Quick Start

### 1. Clone the repository

```bash
git clone https://github.com/airano-ir/skillhub.git
cd skillhub
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and set the following required variables:

```env
# Required: GitHub token for API access
GITHUB_TOKEN=ghp_your_token_here

# Required: Database password (change in production!)
POSTGRES_PASSWORD=your_secure_password

# Required: Meilisearch key (change in production!)
MEILI_MASTER_KEY=your_secure_key

# Optional: Your domain
NEXT_PUBLIC_APP_URL=https://skills.yourdomain.com
```

### 3. Start the services

```bash
# Development mode (without nginx)
docker compose up -d

# Production mode (with nginx reverse proxy)
docker compose --profile production up -d
```

### 4. Initialize the database

The database is automatically initialized when the container starts. You can verify by checking the logs:

```bash
docker compose logs db
```

### 5. Access the application

- Web interface: http://localhost:3000
- Meilisearch: http://localhost:7700

## Production Deployment

### SSL/TLS with Let's Encrypt

1. Install certbot:

```bash
apt install certbot
```

2. Generate certificates:

```bash
certbot certonly --standalone -d skills.yourdomain.com
```

3. Copy certificates to nginx directory:

```bash
mkdir -p nginx/ssl
cp /etc/letsencrypt/live/skills.yourdomain.com/fullchain.pem nginx/ssl/
cp /etc/letsencrypt/live/skills.yourdomain.com/privkey.pem nginx/ssl/
```

4. Update `nginx/nginx.conf` with your domain name.

5. Start with production profile:

```bash
docker compose --profile production up -d
```

### Auto-renewal

Add to crontab:

```bash
0 0 1 * * certbot renew --post-hook "docker compose restart nginx"
```

## Configuration Options

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://postgres:postgres@db:5432/skillhub` |
| `REDIS_URL` | Redis connection string | `redis://redis:6379` |
| `GITHUB_TOKEN` | GitHub PAT for API access | Required |
| `MEILI_MASTER_KEY` | Meilisearch master key | `skillhub-dev-key` |
| `INDEXER_CONCURRENCY` | Number of concurrent indexing jobs | `5` |
| `INDEXER_MIN_STARS` | Minimum GitHub stars for indexing | `2` |

### Scaling

#### Horizontal Scaling

You can run multiple instances of the web service behind a load balancer:

```bash
docker compose up -d --scale web=3
```

#### Resource Limits

Add resource limits in `docker-compose.yml`:

```yaml
services:
  web:
    deploy:
      resources:
        limits:
          cpus: '1'
          memory: 1G
        reservations:
          cpus: '0.5'
          memory: 512M
```

## Maintenance

### Backup

```bash
# Backup PostgreSQL
docker compose exec db pg_dump -U postgres skillhub > backup.sql

# Backup Redis
docker compose exec redis redis-cli BGSAVE

# Copy Redis dump
docker cp skillhub-redis:/data/dump.rdb ./backup-redis.rdb
```

### Restore

```bash
# Restore PostgreSQL
cat backup.sql | docker compose exec -T db psql -U postgres skillhub

# Restore Redis
docker compose stop redis
docker cp ./backup-redis.rdb skillhub-redis:/data/dump.rdb
docker compose start redis
```

### Update

```bash
git pull origin main
docker compose build
docker compose up -d
```

### Logs

```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f web
docker compose logs -f indexer
```

## Troubleshooting

### Database connection issues

```bash
# Check if database is healthy
docker compose exec db pg_isready -U postgres

# Check database logs
docker compose logs db
```

### Indexer not running

```bash
# Check indexer status
docker compose ps indexer

# View indexer logs
docker compose logs -f indexer

# Restart indexer
docker compose restart indexer
```

### Search not working

```bash
# Check Meilisearch status
curl http://localhost:7700/health

# View Meilisearch logs
docker compose logs meilisearch
```

## Security Recommendations

1. **Change default passwords** in `.env`
2. **Use HTTPS** in production
3. **Restrict database access** to internal network only
4. **Enable firewall** and only expose necessary ports
5. **Regular backups** to external storage
6. **Monitor logs** for suspicious activity
7. **Keep Docker and images updated**

## Support

- GitHub Issues: https://github.com/airano-ir/skillhub/issues
- Documentation: https://skills.palebluedot.live/docs
