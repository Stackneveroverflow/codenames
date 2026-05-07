export const icons: Record<
  "back" | "deal" | "demo" | "game" | "key" | "refresh" | "risk" | "score" | "users" | "sound" | "magic",
  unknown
>;

interface IconButtonProps {
  icon: unknown;
  label: string;
  className: string;
  disabled?: boolean;
  onClick: () => void;
  type?: "button" | "submit";
}

export function IconButton(props: IconButtonProps): JSX.Element;
