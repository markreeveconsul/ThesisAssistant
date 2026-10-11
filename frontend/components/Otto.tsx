import Image from "next/image";

export function Otto({
  pose = "welcome",
  animate = false,
}: {
  pose?: "welcome" | "reading" | "searching" | "problem";
  animate?: boolean;
}) {
  return (
    <Image
      className={`otto${animate ? " otto-float" : ""}`}
      src={`/otto/otto-${pose}.png`}
      alt=""
      width={180}
      height={180}
    />
  );
}
