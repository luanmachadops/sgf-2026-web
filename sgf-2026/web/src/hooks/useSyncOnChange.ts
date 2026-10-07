import { useState } from 'react';

const UNSET = Symbol('unset');

/**
 * Roda `sync` (que normalmente chama setState) quando `key` muda — inclusive na
 * primeira renderização. É o padrão recomendado pelo React para "ajustar estado
 * quando uma prop muda" (https://react.dev/learn/you-might-not-need-an-effect),
 * no lugar de um useEffect que faz setState e provoca uma renderização extra.
 * `key` é comparada com Object.is: passe uma string ou um objeto estável.
 */
export function useSyncOnChange(key: unknown, sync: () => void): void {
    const [prev, setPrev] = useState<unknown>(UNSET);
    if (!Object.is(prev, key)) {
        setPrev(key);
        sync();
    }
}
