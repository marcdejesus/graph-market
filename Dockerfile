FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (including dev dependencies for development)
RUN npm ci

# Copy source code
COPY . .

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S graphmarket -u 1001

# Change ownership of the app directory
RUN chown -R graphmarket:nodejs /app
USER graphmarket

EXPOSE 4000

CMD ["npm", "start"] 