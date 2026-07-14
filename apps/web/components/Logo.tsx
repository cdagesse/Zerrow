import Image from "next/image";
import { BRAND_LOGO_URL, BRAND_NAME } from "@/utils/branding";

interface LogoProps {
  className?: string;
}

export function Logo({ className }: LogoProps) {
  if (BRAND_LOGO_URL) {
    return (
      <Image
        src={BRAND_LOGO_URL}
        alt={`${BRAND_NAME} logo`}
        width={209}
        height={25}
        className={className}
        unoptimized
      />
    );
  }

  return (
    <svg viewBox="0 0 190 44" fill="none" className={className}>
      <title>{BRAND_NAME}</title>
      {/* Rocket mark */}
      <g transform="scale(0.6875)">
        <path d="M28 0C22 12 15 28 14 44L14 50L28 58Z" fill="#F4501F" />
        <path d="M28 0C34 12 41 28 42 44L42 50L28 58Z" fill="#D93B12" />
        <path d="M28 32L17 54L28 47L39 54Z" fill="#52565E" />
        <path d="M28 47L22 58L28 54L34 58Z" fill="#141518" />
        <path d="M12 36L4 48L4 62L12 54Z" fill="#E8491D" />
        <path d="M44 36L52 48L52 62L44 54Z" fill="#C13413" />
      </g>
      {/* Wordmark */}
      <text
        x="48"
        y="34"
        fontSize="34"
        fontWeight="700"
        letterSpacing="-0.5"
        fill="currentColor"
        textLength="120"
        lengthAdjust="spacingAndGlyphs"
      >
        Zerrow
      </text>
      <text x="171" y="34" fontSize="34" fontWeight="700" fill="#F4501F">
        .
      </text>
    </svg>
  );
}
