import React from 'react';
import { AlertCircle, CheckCircle, Info, AlertTriangle, X } from 'lucide-react';

export interface SGFAlertProps {
  variant?: 'info' | 'success' | 'warning' | 'error';
  title?: string;
  message: string;
  dismissible?: boolean;
  onDismiss?: () => void;
  className?: string;
}

export const SGFAlert: React.FC<SGFAlertProps> = ({
  variant = 'info',
  title,
  message,
  dismissible = false,
  onDismiss,
  className = '',
}) => {
  const config = {
    info: {
      icon: Info,
      bgColor: 'bg-blue-50',
      borderColor: 'border-blue-200',
      iconColor: 'text-blue-600',
      textColor: 'text-blue-900',
    },
    success: {
      icon: CheckCircle,
      bgColor: 'bg-emerald-50',
      borderColor: 'border-emerald-200',
      iconColor: 'text-emerald-600',
      textColor: 'text-emerald-900',
    },
    warning: {
      icon: AlertTriangle,
      bgColor: 'bg-amber-50',
      borderColor: 'border-amber-200',
      iconColor: 'text-amber-600',
      textColor: 'text-amber-900',
    },
    error: {
      icon: AlertCircle,
      bgColor: 'bg-red-50',
      borderColor: 'border-red-200',
      iconColor: 'text-red-600',
      textColor: 'text-red-900',
    },
  };

  const { icon: Icon, bgColor, borderColor, iconColor, textColor } = config[variant];

  return (
    <div
      className={`${bgColor} ${borderColor} border rounded-2xl p-4 ${className}`}
      role="alert"
    >
      <div className="flex gap-3">
        <div className={`flex-shrink-0 ${iconColor}`}>
          <Icon size={20} />
        </div>

        <div className="flex-1">
          {title && (
            <h4 className={`font-bold text-sm ${textColor} mb-1`}>{title}</h4>
          )}
          <p className={`text-sm ${textColor}`}>{message}</p>
        </div>

        {dismissible && (
          <button
            onClick={onDismiss}
            className={`flex-shrink-0 ${iconColor} hover:opacity-70 transition-opacity`}
            aria-label="Fechar"
          >
            <X size={18} />
          </button>
        )}
      </div>
    </div>
  );
};
