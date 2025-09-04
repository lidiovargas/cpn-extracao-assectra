# Use uma imagem oficial do Node.js como base. A versão 'slim' é menor.
FROM node:18-slim

# Instala as dependências necessárias para o Puppeteer e o Chromium
# Veja: https://pptr.dev/troubleshooting#running-puppeteer-in-docker
RUN apt-get update \
    && apt-get install -y \
    ca-certificates \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libc6 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgbm1 \
    libgcc1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libstdc++6 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    lsb-release \
    wget \
    xdg-utils \
    # E finalmente, instala o Chromium
    chromium \
    # Limpa o cache do apt para manter a imagem pequena
    && rm -rf /var/lib/apt/lists/*

# Define o diretório de trabalho no container
WORKDIR /usr/src/app

# Copia o package.json e o package-lock.json para aproveitar o cache do Docker
COPY package*.json ./

# Instala as dependências do projeto
RUN npm install

# Copia o restante do código-fonte da sua aplicação
COPY . .

# O comando padrão é definido no docker-compose.yml, então não precisamos de CMD/ENTRYPOINT aqui
# para o caso de uso com 'docker compose run'.