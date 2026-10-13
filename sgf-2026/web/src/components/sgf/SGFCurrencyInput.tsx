import { SGFInput, type SGFInputProps } from './SGFInput';

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export interface SGFCurrencyInputProps extends Omit<SGFInputProps, 'value' | 'onChange' | 'type'> {
    /** Valor em reais. */
    value: number;
    onChange: (value: number) => void;
}

/**
 * Campo de valor em reais: mostra "R$ 100.000,00" e aceita só dígitos, que
 * entram pelos centavos (digitar 1, 0, 0 vira R$ 1,00). Apagar tudo zera.
 */
export function SGFCurrencyInput({ value, onChange, ...props }: SGFCurrencyInputProps) {
    const cents = Math.round((Number.isFinite(value) ? value : 0) * 100);
    return (
        <SGFInput
            {...props}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={BRL.format(cents / 100)}
            onChange={(event) => {
                const digits = event.target.value.replace(/\D/g, '').slice(0, 15);
                onChange(digits ? Number(digits) / 100 : 0);
            }}
        />
    );
}
