import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { queryClient, apiRequest } from "@/lib/queryClient";

const resetSchema = z
  .object({
    password: z.string().min(6, "Password must be at least 6 characters long"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });

type ResetFormData = z.infer<typeof resetSchema>;

/** apiRequest errors read "400: {json}"; show just the server's message. */
function serverMessage(error: Error): string {
  const body = error.message.replace(/^\d+:\s*/, "");
  try {
    return JSON.parse(body).message || body;
  } catch {
    return body;
  }
}

export default function ResetPassword() {
  const token = new URLSearchParams(window.location.search).get("token") ?? "";

  const form = useForm<ResetFormData>({
    resolver: zodResolver(resetSchema),
    defaultValues: { password: "", confirmPassword: "" },
  });

  const resetMutation = useMutation({
    mutationFn: async (data: ResetFormData) => {
      const res = await apiRequest("POST", "/api/auth/reset-password", {
        token,
        password: data.password,
      });
      return await res.json();
    },
    onSuccess: (user) => {
      queryClient.setQueryData(["/api/auth/user"], user);
      // Full navigation so the app boots cleanly into the signed-in view.
      window.location.replace("/");
    },
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <Card className="w-full max-w-md border-0 shadow-xl">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Choose a new password</CardTitle>
          <CardDescription>You'll be signed in as soon as it's saved.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!token ? (
            <p className="text-sm text-center text-gray-600">
              This reset link is incomplete. Request a new one from the sign-in page.
            </p>
          ) : (
            <Form {...form}>
              <form onSubmit={form.handleSubmit((data) => resetMutation.mutate(data))} className="space-y-4">
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>New password</FormLabel>
                      <FormControl>
                        <Input
                          type="password"
                          autoComplete="new-password"
                          placeholder="At least 6 characters"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="confirmPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Confirm new password</FormLabel>
                      <FormControl>
                        <Input type="password" autoComplete="new-password" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {resetMutation.isError && (
                  <p className="text-sm text-destructive" role="alert">
                    {serverMessage(resetMutation.error as Error)}
                  </p>
                )}
                <Button type="submit" className="w-full" disabled={resetMutation.isPending}>
                  {resetMutation.isPending ? "Saving..." : "Save new password"}
                </Button>
              </form>
            </Form>
          )}
          <a href="/" className="block text-center text-sm text-primary hover:underline">
            Back to sign in
          </a>
        </CardContent>
      </Card>
    </div>
  );
}
