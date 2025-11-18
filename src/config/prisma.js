const { PrismaClient } = require('@prisma/client');

// Membuat instance PrismaClient
const prisma = new PrismaClient();

module.exports = prisma;