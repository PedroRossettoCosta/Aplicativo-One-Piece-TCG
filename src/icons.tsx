// One stroke icon family: 24px grid, 1.75 stroke, round caps.
const Icon = ({ d, size = 22 }: { d: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);

export const SearchIcon = () => <Icon d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Zm9 2-4-4" />;
export const ScanIcon = () => <Icon size={26} d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2M7 12h10" />;
export const ShelfIcon = () => <Icon d="M4 5h4v14H4zM10 5h4v14h-4zM16.5 5.5l3.5-.9 3 13.6-3.6.9z" />;
export const UserIcon = () => <Icon d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 0 1 14 0" />;
export const PlusIcon = () => <Icon size={20} d="M12 5v14M5 12h14" />;
export const MinusIcon = () => <Icon size={20} d="M5 12h14" />;
export const CloseIcon = () => <Icon size={20} d="M6 6l12 12M18 6 6 18" />;
export const ExternalIcon = () => <Icon size={16} d="M14 4h6v6M20 4l-9 9M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4" />;
