#!/bin/sh
set -e
echo "Running prisma migrate deploy..."
npx prisma migrate deploy --schema ./menve-sales-api/prisma/schema.prisma
exec npm run start
