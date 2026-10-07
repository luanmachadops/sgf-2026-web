import React, { createContext, useContext, useState, type ReactNode, useCallback, useMemo } from 'react';

interface HeaderContextType {
    title: string;
    setTitle: (title: string) => void;
    description: string;
    setDescription: (description: string) => void;
    date: Date;
    setDate: (date: Date) => void;
    searchPlaceholder: string;
    setSearchPlaceholder: (placeholder: string) => void;
    onSearch: (term: string) => void;
    handleSearch: (term: string) => void; // Called by the input
    setSearchHandler: (handler: (term: string) => void) => void;
    headerAction: ReactNode;
    setHeaderAction: (action: ReactNode) => void;
}

const HeaderContext = createContext<HeaderContextType | undefined>(undefined);

export function HeaderProvider({ children }: { children: ReactNode }) {
    const [title, setTitle] = useState('');
    const [date, setDate] = useState(new Date());
    const [searchPlaceholder, setSearchPlaceholder] = useState('Pesquisar...');
    const [searchHandler, setSearchHandlerState] = useState<((term: string) => void) | null>(null);
    const [description, setDescription] = useState('');
    const [headerAction, setHeaderAction] = useState<ReactNode>(null);

    const setSearchHandler = useCallback((handler: (term: string) => void) => {
        setSearchHandlerState(() => handler);
    }, []);

    const handleSearch = useCallback((term: string) => {
        if (searchHandler) {
            searchHandler(term);
        }
    }, [searchHandler]);

    const value = useMemo(() => ({
        title,
        setTitle,
        description,
        setDescription,
        date,
        setDate,
        searchPlaceholder,
        setSearchPlaceholder,
        onSearch: handleSearch,
        handleSearch,
        setSearchHandler,
        headerAction,
        setHeaderAction
    }), [title, description, date, searchPlaceholder, handleSearch, setSearchHandler, headerAction]);

    return (
        <HeaderContext.Provider value={value}>
            {children}
        </HeaderContext.Provider>
    );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useHeader() {
    const context = useContext(HeaderContext);
    if (context === undefined) {
        throw new Error('useHeader must be used within a HeaderProvider');
    }
    return context;
}
