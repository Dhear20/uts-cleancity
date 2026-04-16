# Gunakan image Node.js versi 18 yang ringan
FROM node:18-slim

# Set folder kerja di dalam container
WORKDIR /app

# Copy file package.json dulu untuk install library
COPY package*.json ./

# Install semua library (dependencies)
RUN npm install

# Copy semua file aplikasi dari laptop ke container
COPY . .

# Buka port 3000 (sesuai app.js)
EXPOSE 3000

# Perintah untuk menyalakan aplikasi
CMD ["node", "app.js"]