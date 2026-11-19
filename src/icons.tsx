// One stroke icon family: 24px grid, 1.75 stroke, round caps. Tab icons also come filled, for the open page.
const Icon = ({ d, size = 22, fill }: { d: string; size?: number; fill?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {fill && <path d={fill} fill="currentColor" />}
    <path d={d} />
  </svg>
);
type TabIcon = { filled?: boolean };

export const SearchIcon = () => <Icon d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Zm9 2-4-4" />;
export const ScanIcon = () => <Icon size={26} d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2M7 12h10" />;
const SHELF = 'M4 5h4v14H4zM10 5h4v14h-4zM16.5 5.5l3.5-.9 3 13.6-3.6.9z';
export const ShelfIcon = ({ filled }: TabIcon) => <Icon d={SHELF} fill={filled ? SHELF : undefined} />;
const USER = 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 0 1 14 0';
export const UserIcon = ({ filled }: TabIcon) => <Icon d={USER} fill={filled ? `${USER}Z` : undefined} />;
export const PlusIcon = () => <Icon size={20} d="M12 5v14M5 12h14" />;
export const MinusIcon = () => <Icon size={20} d="M5 12h14" />;
export const CloseIcon = () => <Icon size={20} d="M6 6l12 12M18 6 6 18" />;
export const ExternalIcon = () => <Icon size={16} d="M14 4h6v6M20 4l-9 9M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4" />;
export const FilterIcon = () => <Icon d="M4 6h16M7 12h10M10 18h4" />;
const HEART = 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z';
export const WishIcon = ({ filled }: TabIcon) => <Icon d={HEART} fill={filled ? HEART : undefined} />;
const FRONT_CARD = 'M5 7h10a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1Z';
export const DecksIcon = ({ filled }: TabIcon) => <Icon d={`M8 4h10a1 1 0 0 1 1 1v13${FRONT_CARD}`} fill={filled ? FRONT_CARD : undefined} />;
export const CopyIcon = () => <Icon size={20} d="M9 9h10v11H9zM5 15V4h10" />;
export const ImportIcon = () => <Icon size={20} d="M12 4v11m0 0-4-4m4 4 4-4M5 20h14" />;
export const TrashIcon = () => <Icon size={20} d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />;
export const BackIcon = () => <Icon d="M15 5l-7 7 7 7" />;
export const CheckIcon = () => <Icon size={18} d="M5 12.5l4.5 4.5L19 7" />;
