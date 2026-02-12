'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';

interface HeroSearchProps {
  placeholder: string;
  locale: string;
}

export function HeroSearch({ placeholder, locale }: HeroSearchProps) {
  const [query, setQuery] = useState('');
  const router = useRouter();

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      router.push(`/${locale}/browse?q=${encodeURIComponent(query.trim())}`);
    } else {
      router.push(`/${locale}/browse`);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="max-w-xl mx-auto mb-8 animate-fade-up animation-delay-300">
      <div className="relative">
        <Search className="absolute start-4 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={placeholder}
          className="input-field ps-12 pe-24"
        />
        <button
          type="submit"
          className="absolute end-2 top-1/2 -translate-y-1/2 btn-primary py-1.5 px-4 text-sm"
        >
          <Search className="w-4 h-4" />
        </button>
      </div>
    </form>
  );
}
