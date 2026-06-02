import React, { type HTMLAttributes } from 'react';
import { TrendingUp, TrendingDown, Minus } from '../sgf/icons';
import { Card as BaseCard, CardContent, CardHeader } from './Card';
import { cn } from '@/lib/utils';

export interface StatsCardProps extends HTMLAttributes<HTMLDivElement> {
    title: string;
    value: string | number;
    subtitle?: string;
    icon?: React.ReactNode;
    trend?: {
        value: number;
        label: string;
    };
    variant?: 'default' | 'primary' | 'success' | 'warning' | 'danger';
}

export default function StatsCard({
    title,
    value,
    subtitle,
    icon,
    trend,
    variant = 'default',
    className,
    ...props
}: StatsCardProps) {
    const variants = {
        default: 'bg-white',
        primary: 'bg-sgf-primary text-white',
        success: 'bg-green-600 text-white',
        warning: 'bg-yellow-600 text-white',
        danger: 'bg-red-600 text-white',
    };

    const isColored = variant !== 'default';

    const getTrendIcon = () => {
        if (!trend) return null;
        if (trend.value > 0) return <TrendingUp className="h-4 w-4" />;
        if (trend.value < 0) return <TrendingDown className="h-4 w-4" />;
        return <Minus className="h-4 w-4" />;
    };

    const getTrendColor = () => {
        if (!trend) return '';
        if (trend.value > 0) return isColored ? 'text-white/90' : 'text-green-600';
        if (trend.value < 0) return isColored ? 'text-white/90' : 'text-red-600';
        return isColored ? 'text-white/70' : 'text-gray-600';
    };

    return (
        <BaseCard
            className={cn(variants[variant], className)}
            {...props}
        >
            <CardContent className="p-6">
                <div className="flex items-start justify-between">
                    <div className="flex-1">
                        <p
                            className={cn(
                                'text-sm font-medium',
                                isColored ? 'text-white/80' : 'text-gray-600'
                            )}
                        >
                            {title}
                        </p>
                        <p
                            className={cn(
                                'mt-2 text-3xl font-bold',
                                isColored ? 'text-white' : 'text-gray-900'
                            )}
                        >
                            {value}
                        </p>
                        {subtitle && (
                            <p
                                className={cn(
                                    'mt-1 text-sm',
                                    isColored ? 'text-white/70' : 'text-gray-500'
                                )}
                            >
                                {subtitle}
                            </p>
                        )}
                        {trend && (
                            <div className={cn('mt-3 flex items-center gap-1 text-sm', getTrendColor())}>
                                {getTrendIcon()}
                                <span className="font-medium">
                                    {trend.value > 0 && '+'}
                                    {trend.value}%
                                </span>
                                <span className={isColored ? 'text-white/60' : 'text-gray-500'}>
                                    {trend.label}
                                </span>
                            </div>
                        )}
                    </div>
                    {icon && (
                        <div
                            className={cn(
                                'rounded-lg p-3',
                                isColored ? 'bg-white/10' : 'bg-gray-100'
                            )}
                        >
                            {icon}
                        </div>
                    )}
                </div>
            </CardContent>
        </BaseCard>
    );
}
