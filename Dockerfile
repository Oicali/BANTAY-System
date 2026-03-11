# Use Node base image
FROM node:18

# Install Python
RUN apt-get update && apt-get install -y python3 python3-pip

# Set working directory
WORKDIR /app

# Copy backend package files and install Node deps
COPY backend/package*.json ./backend/
RUN cd backend && npm install

# Copy Python requirements and install
COPY backend/python/requirements.txt ./backend/python/
RUN pip3 install -r backend/python/requirements.txt

# Copy the rest of backend code
COPY backend/ ./backend/

# Expose backend port
EXPOSE 3000

# Start Node backend (which can call Python internally)
CMD ["npm", "start", "--prefix", "backend"]
