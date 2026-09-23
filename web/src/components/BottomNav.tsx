import React from 'react';
import { Home, School, LineChart, Compass } from 'lucide-react';
import { AppRoute } from '../types';

interface BottomNavProps {
  currentRoute: AppRoute;
  onNavigate: (route: AppRoute) => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({ currentRoute, onNavigate }) => {
  const items: { label: string; route: AppRoute; icon: React.ComponentType<{ className?: string }> }[] = [
    { label: 'Home', route: 'home', icon: Home },
    { label: 'Explore', route: 'explore', icon: Compass },
    { label: 'Classroom', route: 'classroom', icon: School },
    { label: 'Analytics', route: 'analytics', icon: LineChart },
  ];

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-darkSurface-elev1/95 backdrop-blur-lg border-t border-surface-border dark:border-darkSurface-border safe-area-bottom shadow-2xl transition-all">
      <div className="flex items-center justify-around h-16 px-2">
        {items.map((item) => {
          const Icon = item.icon;
          const isSelected =
            currentRoute === item.route ||
            (item.route === 'explore' &&
              (currentRoute === 'explore_exam' || currentRoute === 'exam_results'));

          return (
            <button
              key={item.label}
              onClick={() => onNavigate(item.route)}
              className="flex flex-col items-center justify-center flex-1 py-1 group transition-all"
            >
              <div
                className={`flex items-center justify-center transition-all duration-200 ${
                  isSelected
                    ? 'w-12 h-8 rounded-xl bg-gradient-to-r from-brand-primary to-brand-variant text-white shadow-md scale-105'
                    : 'w-10 h-7 text-surface-muted dark:text-darkSurface-muted group-hover:text-brand-primary'
                }`}
              >
                <Icon className={`w-5 h-5 transition-transform duration-200 ${isSelected ? 'scale-110' : ''}`} />
              </div>
              <span
                className={`text-[10px] mt-1 transition-colors ${
                  isSelected
                    ? 'font-bold text-brand-primary'
                    : 'font-medium text-surface-muted dark:text-darkSurface-muted'
                }`}
              >
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
