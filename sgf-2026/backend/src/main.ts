import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
    const app = await NestFactory.create(AppModule);

    const configuredOrigins = (process.env.CORS_ORIGIN || '')
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean);

    // Enable CORS
    app.enableCors({
        origin: (origin, callback) => {
            if (!origin) {
                callback(null, true);
                return;
            }

            const defaultOrigins = [
                'http://localhost:5173',
                'http://localhost:5174',
                'http://localhost:3000',
                'http://localhost:3001',
            ];

            const allowedOrigins = new Set([...defaultOrigins, ...configuredOrigins]);

            if (allowedOrigins.has(origin)) {
                callback(null, true);
                return;
            }

            try {
                const hostname = new URL(origin).hostname;
                if (hostname.endsWith('.vercel.app')) {
                    callback(null, true);
                    return;
                }
            } catch {
                // Ignore parsing errors and reject below.
            }

            callback(new Error(`Origin not allowed by CORS: ${origin}`), false);
        },
        methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
        credentials: true,
    });

    // Global validation pipe
    app.useGlobalPipes(
        new ValidationPipe({
            whitelist: true,
            forbidNonWhitelisted: true,
            transform: true,
        }),
    );

    // Global prefix
    app.setGlobalPrefix('api');

    // Swagger documentation
    const config = new DocumentBuilder()
        .setTitle('SGF 2026 API')
        .setDescription('Sistema de Gestão de Frotas Municipal - API Documentation')
        .setVersion('1.0')
        .addBearerAuth()
        .addTag('auth', 'Autenticação')
        .addTag('vehicles', 'Veículos')
        .addTag('drivers', 'Motoristas')
        .addTag('trips', 'Viagens')
        .addTag('refuelings', 'Abastecimentos')
        .addTag('maintenances', 'Manutenções')
        .addTag('checklists', 'Checklists')
        .addTag('dashboard', 'Dashboard e KPIs')
        .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);

    const port = process.env.PORT || 3000;
    await app.listen(port);

    console.log(`🚀 SGF 2026 API running on: http://localhost:${port}`);
    console.log(`📚 Swagger docs: http://localhost:${port}/api/docs`);
}

bootstrap();
