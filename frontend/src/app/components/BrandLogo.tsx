import Image from "next/image";

type BrandLogoProps = {
  size?: number;
  className?: string;
  priority?: boolean;
};

export default function BrandLogo({ size = 64, className = "", priority = false }: BrandLogoProps) {
  return (
    <Image
      src="/Logo.jpeg"
      alt="MedSyra logo"
      width={size}
      height={size}
      priority={priority}
      className={className}
    />
  );
}
