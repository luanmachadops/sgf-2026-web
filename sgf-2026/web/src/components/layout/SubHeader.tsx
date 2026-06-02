import React from 'react';
import { useHeader } from '@/contexts/HeaderContext';
import { Search } from '@/components/sgf/icons';

export default function SubHeader() {
    const { searchPlaceholder, handleSearch } = useHeader();


    return (
        <div className="bg-white px-8 py-6 border-b border-gray-50">
            <div className="flex items-center justify-between">
                {/* Left Side: Title and Date */}
                <div>
                    {/* Title removed - moved to Header */}
                </div>


                {/* Right Side: Page-level Search */}
                <div className="flex items-center gap-4">
                    <div className="relative group min-w-[400px]">
                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                            <Search className="h-4 w-4 text-slate-300 group-focus-within:text-emerald-500 transition-colors" />
                        </div>
                        <input
                            type="text"
                            placeholder={searchPlaceholder}
                            className="block w-full pl-11 pr-4 py-3 bg-gray-50 border-transparent rounded-2xl text-sm font-medium placeholder:text-slate-400 focus:bg-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500/20 focus:outline-none transition-all"
                            onChange={(e) => handleSearch(e.target.value)}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}
