import { Smartphone } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";

export interface DesktopOnlyProps {
  className?: string;
}

export function DesktopOnly({ className }: DesktopOnlyProps) {
  return (
    <div className="min-h-screen bg-neutral-dark-default from-slate-50 to-slate-100 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md">
        <Card className="bg-neutral-dark-600 border-neutral-light-white-12">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto mb-4 bg-neutral-dark-700 p-3 rounded-full">
              <Smartphone className="h-8 w-8 text-primary-default" />
            </div>
            <CardTitle className="text-xl font-bold text-white">Mobile Coming Soon</CardTitle>
            <CardDescription className="text-primary-default">Our app is currently only available on desktop devices</CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <p className="mb-6 text-white-200">
              We're working hard to bring this experience to mobile. Please visit us on a desktop browser to use the
              full application.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}