import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Compass } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gray-50">
      <Card className="w-full max-w-md mx-4">
        <CardContent className="pt-6 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Compass className="h-6 w-6 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">
            We can&apos;t find that page
          </h1>
          <p className="mt-3 text-sm text-gray-600">
            The link may be out of date, or the page may have moved. Your
            leagues and picks are unaffected.
          </p>
          <div className="mt-6 flex flex-col sm:flex-row gap-2 justify-center">
            <Button asChild>
              <Link href="/">Go to my leagues</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/rules">Read the rules</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
