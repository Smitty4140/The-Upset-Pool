import { Link } from "wouter";

export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-white border-t mt-12">
      <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-sm text-gray-500">
            &copy; {currentYear} Upset Pool
          </p>
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/rules">
              <span className="cursor-pointer text-gray-500 hover:text-gray-800 transition-colors">
                Rules
              </span>
            </Link>
            <a
              href="https://buymeacoffee.com/theupsetpool"
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-500 hover:text-gray-800 transition-colors"
            >
              Support the pool
            </a>
            <a
              href="https://playminigames.net/game/snood"
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-400 hover:text-gray-700 transition-colors"
              title="Bye-bye, productivity"
            >
              Snood
            </a>
          </nav>
        </div>
      </div>
    </footer>
  );
}
