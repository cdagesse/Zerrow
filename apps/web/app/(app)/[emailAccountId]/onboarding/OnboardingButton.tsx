import { IconCircle } from "@/app/(app)/[emailAccountId]/onboarding/IconCircle";

export function OnboardingButton({
  text,
  icon,
  onClick,
}: {
  text: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="rounded-xl border bg-card p-4 text-card-foreground shadow-sm text-left flex items-center gap-4 transition-all hover:border-primary hover:ring-2 hover:ring-primary/20"
      onClick={onClick}
    >
      <IconCircle size="sm">{icon}</IconCircle>

      <div className="flex-1">
        <div className="font-medium">{text}</div>
      </div>
    </button>
  );
}
