import { Controller, Post, Body, Get, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { LoginDriverDto, LoginUserDto, AuthResponseDto } from './dto/auth.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
    constructor(private readonly authService: AuthService) { }

    @Post('driver/login')
    @ApiOperation({ summary: 'Login for drivers (CPF + password)' })
    @ApiResponse({ status: 200, description: 'Login successful.', type: AuthResponseDto })
    @ApiResponse({ status: 401, description: 'Invalid credentials or account locked.' })
    loginDriver(@Body() loginDto: LoginDriverDto) {
        return this.authService.loginDriver(loginDto);
    }

    @Post('driver-login')
    @ApiOperation({ summary: 'Legacy login route for drivers (CPF + password)' })
    @ApiResponse({ status: 200, description: 'Login successful.', type: AuthResponseDto })
    @ApiResponse({ status: 401, description: 'Invalid credentials or account locked.' })
    loginDriverLegacy(@Body() loginDto: LoginDriverDto) {
        return this.authService.loginDriver(loginDto);
    }

    @Post('user/login')
    @ApiOperation({ summary: 'Login for managers/admins (email + password)' })
    @ApiResponse({ status: 200, description: 'Login successful.', type: AuthResponseDto })
    @ApiResponse({ status: 401, description: 'Invalid credentials or account locked.' })
    loginUser(@Body() loginDto: LoginUserDto) {
        return this.authService.loginUser(loginDto);
    }

    @Get('profile')
    @UseGuards(AuthGuard('jwt'))
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Get authenticated user profile' })
    @ApiResponse({ status: 200, description: 'Return authenticated user profile.' })
    @ApiResponse({ status: 401, description: 'Unauthorized.' })
    getProfile(@Request() req: any) {
        return this.authService.getProfile(req.user.sub, req.user.type);
    }

    @Post('logout')
    @UseGuards(AuthGuard('jwt'))
    @ApiBearerAuth()
    @ApiOperation({ summary: 'Logout (invalidate session)' })
    @ApiResponse({ status: 200, description: 'Logout successful.' })
    logout() {
        // Em uma implementação real, invalidaríamos o token em um blacklist (Redis)
        return { message: 'Logout successful' };
    }
}
