import Image from 'next/image';
import Link from 'next/link';
import type { MouseEventHandler } from 'react';

export function PassnessBrand({
  href,
  ariaLabel,
  className,
  logoClassName,
  suffix,
  onClick,
  priority = false,
}: {
  href: string;
  ariaLabel: string;
  className?: string | undefined;
  logoClassName?: string | undefined;
  suffix?: string | undefined;
  onClick?: MouseEventHandler<HTMLAnchorElement> | undefined;
  priority?: boolean | undefined;
}): React.JSX.Element {
  const linkProps = {
    href,
    ...(className ? { className } : {}),
    ...(onClick ? { onClick } : {}),
  };

  return (
    <Link {...linkProps} aria-label={ariaLabel}>
      <Image
        src="/images/brand/passness-logo.svg"
        alt=""
        width={40}
        height={40}
        {...(logoClassName ? { className: logoClassName } : {})}
        priority={priority}
      />
      <span>
        passness
        {suffix ? (
          <>
            {' '}
            <em>{suffix}</em>
          </>
        ) : null}
      </span>
    </Link>
  );
}
