# Use an official Node.js runtime as a base image
FROM node:18

# Set the working directory in the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json (if available)
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application files
COPY . .

# Expose port 3000 (the port your app will run on)
EXPOSE 3000

# Command to start the Node.js app *Command in docker-compose.yml
# CMD ["node", "main/main.js"]
