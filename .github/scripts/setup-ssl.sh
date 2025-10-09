#!/bin/bash

# Setup SSL with Let's Encrypt for romplin-recipe.com
# Run this script on your Hetzner server as root

set -e

echo "Installing certbot..."
apt-get update
apt-get install -y certbot python3-certbot-nginx

echo "Creating certbot webroot directory..."
mkdir -p /var/www/certbot

echo "Obtaining SSL certificate..."
certbot certonly --webroot \
  -w /var/www/certbot \
  -d romplin-recipe.com \
  -d www.romplin-recipe.com \
  --non-interactive \
  --agree-tos \
  --email admin@romplin-recipe.com

echo "Setting up auto-renewal..."
systemctl enable certbot.timer
systemctl start certbot.timer

echo "Reloading nginx..."
systemctl reload nginx

echo "SSL setup complete!"
echo "Certificate will auto-renew via certbot timer"
