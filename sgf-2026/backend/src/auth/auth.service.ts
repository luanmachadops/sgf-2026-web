import { Injectable, UnauthorizedException } from '@nestjs/common';
import { supabaseAdmin } from '../config/supabase.config';
import { LoginDriverDto, LoginUserDto, AuthResponseDto } from './dto/auth.dto';

export interface JwtPayload {
    sub: string;
    type: 'driver' | 'user';
    role?: string;
    cpf?: string;
    email?: string;
}

@Injectable()
export class AuthService {
    private readonly MAX_LOGIN_ATTEMPTS = 3;
    private loginAttempts: Map<string, { count: number; lockedUntil?: Date }> = new Map();

    // RF-001: Login do Motorista (CPF + Senha)
    async loginDriver(loginDto: LoginDriverDto): Promise<AuthResponseDto> {
        const lockKey = `driver:${loginDto.cpf}`;
        this.checkLockout(lockKey);

        try {
            // Buscar driver pelo CPF
            const { data: driver, error: driverError } = await supabaseAdmin
                .from('drivers')
                .select('*')
                .eq('cpf', loginDto.cpf)
                .single();

            if (driverError || !driver) {
                this.recordFailedAttempt(lockKey);
                throw new UnauthorizedException('Invalid credentials');
            }

            if (driver.status !== 'ACTIVE') {
                throw new UnauthorizedException('Driver account is not active');
            }

            // Fazer login com Supabase Auth usando email (construído a partir do CPF)
            const email = `driver-${loginDto.cpf}@internal.sgf2026.local`;
            const { data: authData, error: authError } = await supabaseAdmin.auth.signInWithPassword({
                email,
                password: loginDto.password,
            });

            if (authError) {
                this.recordFailedAttempt(lockKey);
                throw new UnauthorizedException('Invalid credentials');
            }

            // Limpar tentativas após login bem-sucedido
            this.loginAttempts.delete(lockKey);

            return {
                accessToken: authData.session!.access_token,
                access_token: authData.session!.access_token,
                userType: 'driver',
                userId: driver.id,
                name: driver.name,
                driver: {
                    id: driver.id,
                    name: driver.name,
                    cpf: driver.cpf,
                    cnh_number: driver.cnh_number,
                    cnh_category: driver.cnh_category,
                    cnh_expiry: driver.cnh_expiry_date,
                    department: driver.department_id || '',
                    status: driver.status,
                    score: driver.score ?? 0,
                    phone: driver.phone || undefined,
                },
            };
        } catch (error) {
            if (error instanceof UnauthorizedException) {
                throw error;
            }
            throw new UnauthorizedException('Login failed');
        }
    }

    // RF-002: Login do Gestor (Email + Senha)
    async loginUser(loginDto: LoginUserDto): Promise<AuthResponseDto> {
        const lockKey = `user:${loginDto.email}`;
        this.checkLockout(lockKey);

        try {
            // Buscar usuário pelo email
            const { data: user, error: userError } = await supabaseAdmin
                .from('users')
                .select('*')
                .eq('email', loginDto.email)
                .single();

            if (userError || !user) {
                this.recordFailedAttempt(lockKey);
                throw new UnauthorizedException('Invalid credentials');
            }

            // Fazer login com Supabase Auth
            const { data: authData, error: authError } = await supabaseAdmin.auth.signInWithPassword({
                email: loginDto.email,
                password: loginDto.password,
            });

            if (authError) {
                this.recordFailedAttempt(lockKey);
                throw new UnauthorizedException('Invalid credentials');
            }

            this.loginAttempts.delete(lockKey);

            return {
                accessToken: authData.session!.access_token,
                userType: 'user',
                userId: user.id,
                name: user.name,
                role: user.role,
            };
        } catch (error) {
            if (error instanceof UnauthorizedException) {
                throw error;
            }
            throw new UnauthorizedException('Login failed');
        }
    }

    async validateToken(token: string): Promise<JwtPayload> {
        try {
            const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

            if (error || !user) {
                throw new UnauthorizedException('Invalid token');
            }

            // Determinar tipo de usuário baseado no email
            const isDriver = user.email?.startsWith('driver-');

            if (isDriver) {
                const cpf = user.email!.replace('driver-', '').split('@')[0];
                const { data: driver } = await supabaseAdmin
                    .from('drivers')
                    .select('id, cpf')
                    .eq('cpf', cpf)
                    .single();

                return {
                    sub: driver?.id || user.id,
                    type: 'driver',
                    cpf,
                };
            } else {
                const { data: userData } = await supabaseAdmin
                    .from('users')
                    .select('id, email, role')
                    .eq('email', user.email)
                    .single();

                return {
                    sub: userData?.id || user.id,
                    type: 'user',
                    role: userData?.role,
                    email: user.email!,
                };
            }
        } catch {
            throw new UnauthorizedException('Invalid token');
        }
    }

    async getProfile(userId: string, userType: 'driver' | 'user'): Promise<any> {
        if (userType === 'driver') {
            const { data: driver, error } = await supabaseAdmin
                .from('drivers')
                .select('*, department:departments(*)')
                .eq('id', userId)
                .single();

            if (error || !driver) {
                throw new UnauthorizedException('Driver not found');
            }

            const { password_hash, ...profile } = driver;
            return profile;
        } else {
            const { data: user, error } = await supabaseAdmin
                .from('users')
                .select('*, department:departments(*)')
                .eq('id', userId)
                .single();

            if (error || !user) {
                throw new UnauthorizedException('User not found');
            }

            const { password_hash, ...profile } = user;
            return profile;
        }
    }

    private checkLockout(key: string): void {
        const attempts = this.loginAttempts.get(key);
        if (attempts?.lockedUntil && attempts.lockedUntil > new Date()) {
            const remainingMinutes = Math.ceil((attempts.lockedUntil.getTime() - Date.now()) / 60000);
            throw new UnauthorizedException(
                `Account locked. Try again in ${remainingMinutes} minutes.`
            );
        }
    }

    private recordFailedAttempt(key: string): void {
        const attempts = this.loginAttempts.get(key) || { count: 0 };
        attempts.count++;

        if (attempts.count >= this.MAX_LOGIN_ATTEMPTS) {
            // Bloquear por 15 minutos (RF-001)
            attempts.lockedUntil = new Date(Date.now() + 15 * 60 * 1000);
        }

        this.loginAttempts.set(key, attempts);
    }
}
