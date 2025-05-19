import React, { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { User, League, LeagueMember } from '@/lib/types';
import { Helmet } from 'react-helmet';
import { Redirect } from 'wouter';

// UI Components
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { 
  Users, 
  Settings, 
  Trophy, 
  User as UserIcon, 
  MoreHorizontal, 
  Shield, 
  ShieldAlert, 
  UserPlus, 
  UserMinus 
} from "lucide-react";

export default function AdminDashboard() {
  const { user, isAuthenticated, isLoading: isLoadingAuth } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("leagues");
  const [newUserEmail, setNewUserEmail] = useState("");
  const [selectedLeagueId, setSelectedLeagueId] = useState<number | null>(null);
  const [isAddUserDialogOpen, setIsAddUserDialogOpen] = useState(false);
  
  // Fetch leagues
  const { data: leagues, isLoading: isLoadingLeagues } = useQuery<League[]>({
    queryKey: ['/api/leagues'],
    enabled: isAuthenticated,
  });
  
  // Fetch all users
  const { data: allUsers, isLoading: isLoadingUsers } = useQuery<User[]>({
    queryKey: ['/api/users'],
    enabled: isAuthenticated,
  });
  
  // Fetch league members for the selected league
  const { data: leagueMembers, isLoading: isLoadingMembers } = useQuery<(LeagueMember & { user: User })[]>({
    queryKey: [`/api/leagues/${selectedLeagueId}/members`],
    enabled: !!selectedLeagueId && isAuthenticated,
  });
  
  // Add user to league mutation
  const { mutate: addUserToLeague, isPending: isAddingUser } = useMutation({
    mutationFn: async ({ leagueId, userId, isAdmin }: { leagueId: number, userId: string, isAdmin: boolean }) => {
      return apiRequest('POST', `/api/leagues/${leagueId}/members`, { userId, isAdmin });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/leagues/${selectedLeagueId}/members`] });
      toast({
        title: 'User added to league',
        description: 'The user has been successfully added to the league.',
        variant: 'default',
      });
      setIsAddUserDialogOpen(false);
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to add user to league',
        variant: 'destructive',
      });
    },
  });
  
  // Remove user from league mutation
  const { mutate: removeUserFromLeague, isPending: isRemovingUser } = useMutation({
    mutationFn: async ({ leagueId, userId }: { leagueId: number, userId: string }) => {
      return apiRequest('DELETE', `/api/leagues/${leagueId}/members/${userId}`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/leagues/${selectedLeagueId}/members`] });
      toast({
        title: 'User removed from league',
        description: 'The user has been successfully removed from the league.',
        variant: 'default',
      });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to remove user from league',
        variant: 'destructive',
      });
    },
  });
  
  // Toggle admin status mutation
  const { mutate: toggleAdminStatus, isPending: isTogglingAdmin } = useMutation({
    mutationFn: async ({ leagueId, userId, isAdmin }: { leagueId: number, userId: string, isAdmin: boolean }) => {
      return apiRequest('PATCH', `/api/leagues/${leagueId}/members/${userId}`, { isAdmin });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/leagues/${selectedLeagueId}/members`] });
      toast({
        title: 'Admin status updated',
        description: 'The user\'s admin status has been updated.',
        variant: 'default',
      });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to update admin status',
        variant: 'destructive',
      });
    },
  });
  
  // Check if the current user is an admin
  const isAdmin = user?.id === "42820911"; // Your ID

  // Redirect non-admin users
  if (!isLoadingAuth && isAuthenticated && !isAdmin) {
    return <Redirect to="/" />;
  }
  
  // Loading state
  if (isLoadingAuth || isLoadingLeagues || (selectedLeagueId && isLoadingMembers)) {
    return (
      <div className="p-8 max-w-7xl mx-auto">
        <div className="flex flex-col gap-4">
          <Skeleton className="h-10 w-1/3" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }
  
  // Handle add user form submission
  const handleAddUser = (userId: string) => {
    if (!selectedLeagueId) return;
    
    addUserToLeague({
      leagueId: selectedLeagueId,
      userId,
      isAdmin: false
    });
  };
  
  // Handle remove user
  const handleRemoveUser = (userId: string) => {
    if (!selectedLeagueId) return;
    
    if (confirm('Are you sure you want to remove this user from the league?')) {
      removeUserFromLeague({
        leagueId: selectedLeagueId,
        userId
      });
    }
  };
  
  // Handle toggle admin status
  const handleToggleAdmin = (userId: string, currentStatus: boolean) => {
    if (!selectedLeagueId) return;
    
    toggleAdminStatus({
      leagueId: selectedLeagueId,
      userId,
      isAdmin: !currentStatus
    });
  };
  
  return (
    <div className="p-8 max-w-7xl mx-auto">
      <Helmet>
        <title>Admin Dashboard | NFL Upset Pool</title>
        <meta name="description" content="Admin dashboard for managing leagues and users in the NFL Upset Pool" />
      </Helmet>
      
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">Admin Dashboard</h1>
        <Button variant="outline" onClick={() => window.history.back()}>
          Back
        </Button>
      </div>
      
      <Tabs defaultValue={activeTab} onValueChange={setActiveTab} className="mb-8">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="leagues">
            <Trophy className="h-4 w-4 mr-2" />
            Leagues
          </TabsTrigger>
          <TabsTrigger value="users">
            <Users className="h-4 w-4 mr-2" />
            Users
          </TabsTrigger>
        </TabsList>
        
        {/* Leagues Tab */}
        <TabsContent value="leagues">
          <Card>
            <CardHeader>
              <CardTitle>League Management</CardTitle>
              <CardDescription>
                Manage leagues and their members
              </CardDescription>
            </CardHeader>
            <CardContent>
              {leagues && leagues.length > 0 ? (
                <div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                    {leagues.map(league => (
                      <Card 
                        key={league.id} 
                        className={`cursor-pointer hover:shadow-md transition-all ${
                          selectedLeagueId === league.id ? 'ring-2 ring-primary' : ''
                        }`}
                        onClick={() => setSelectedLeagueId(league.id)}
                      >
                        <CardHeader className="pb-3">
                          <CardTitle className="flex items-center">
                            <Trophy className="h-5 w-5 mr-2 text-primary" />
                            {league.name}
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <p className="text-sm text-gray-500">
                            {league.description || 'No description'}
                          </p>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                  
                  {selectedLeagueId && (
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-xl font-bold">League Members</h3>
                        <Dialog open={isAddUserDialogOpen} onOpenChange={setIsAddUserDialogOpen}>
                          <DialogTrigger asChild>
                            <Button>
                              <UserPlus className="h-4 w-4 mr-2" />
                              Add Member
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Add User to League</DialogTitle>
                              <DialogDescription>
                                Select a user to add to this league.
                              </DialogDescription>
                            </DialogHeader>
                            
                            {allUsers && allUsers.length > 0 ? (
                              <div className="max-h-80 overflow-y-auto py-2">
                                {allUsers
                                  .filter(u => !leagueMembers?.some(m => m.userId === u.id))
                                  .map(user => (
                                    <div 
                                      key={user.id}
                                      className="flex items-center justify-between p-3 hover:bg-gray-100 rounded-md cursor-pointer"
                                      onClick={() => handleAddUser(user.id)}
                                    >
                                      <div className="flex items-center">
                                        <Avatar className="h-8 w-8 mr-3">
                                          <AvatarImage 
                                            src={user.profileImageUrl || undefined} 
                                            alt={user.username} 
                                          />
                                          <AvatarFallback>
                                            {user.username.substring(0, 2).toUpperCase()}
                                          </AvatarFallback>
                                        </Avatar>
                                        <div>
                                          <p className="font-medium">{user.username}</p>
                                          <p className="text-xs text-gray-500">{user.email}</p>
                                        </div>
                                      </div>
                                      <Button size="sm" variant="ghost">
                                        <UserPlus className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  ))}
                              </div>
                            ) : (
                              <p className="text-center py-4">No users available to add</p>
                            )}
                            
                            <DialogFooter>
                              <Button variant="outline" onClick={() => setIsAddUserDialogOpen(false)}>
                                Cancel
                              </Button>
                            </DialogFooter>
                          </DialogContent>
                        </Dialog>
                      </div>
                      
                      {leagueMembers && leagueMembers.length > 0 ? (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>User</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead>Joined</TableHead>
                              <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {leagueMembers.map(member => (
                              <TableRow key={`${member.leagueId}-${member.userId}`}>
                                <TableCell>
                                  <div className="flex items-center">
                                    <Avatar className="h-8 w-8 mr-3">
                                      <AvatarImage 
                                        src={member.user.profileImageUrl || undefined} 
                                        alt={member.user.username} 
                                      />
                                      <AvatarFallback>
                                        {member.user.username.substring(0, 2).toUpperCase()}
                                      </AvatarFallback>
                                    </Avatar>
                                    <div>
                                      <p className="font-medium">{member.user.username}</p>
                                      <p className="text-xs text-gray-500">{member.user.email}</p>
                                    </div>
                                  </div>
                                </TableCell>
                                <TableCell>
                                  {member.isAdmin ? (
                                    <Badge variant="default" className="bg-amber-500">
                                      <ShieldAlert className="h-3 w-3 mr-1" />
                                      Admin
                                    </Badge>
                                  ) : (
                                    <Badge variant="outline">
                                      <UserIcon className="h-3 w-3 mr-1" />
                                      Member
                                    </Badge>
                                  )}
                                </TableCell>
                                <TableCell>
                                  {new Date(member.createdAt).toLocaleDateString()}
                                </TableCell>
                                <TableCell className="text-right">
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button variant="ghost" size="sm">
                                        <MoreHorizontal className="h-4 w-4" />
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                      <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                      <DropdownMenuSeparator />
                                      <DropdownMenuItem 
                                        onClick={() => handleToggleAdmin(member.userId, member.isAdmin)}
                                        disabled={isTogglingAdmin}
                                      >
                                        <Shield className="h-4 w-4 mr-2" />
                                        {member.isAdmin ? 'Remove Admin' : 'Make Admin'}
                                      </DropdownMenuItem>
                                      <DropdownMenuItem 
                                        onClick={() => handleRemoveUser(member.userId)}
                                        disabled={isRemovingUser}
                                        className="text-destructive focus:text-destructive"
                                      >
                                        <UserMinus className="h-4 w-4 mr-2" />
                                        Remove from League
                                      </DropdownMenuItem>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      ) : (
                        <div className="text-center py-8 border rounded-lg">
                          <p className="text-gray-500">No members in this league</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-8 border rounded-lg">
                  <p className="text-gray-500">No leagues available</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        
        {/* Users Tab */}
        <TabsContent value="users">
          <Card>
            <CardHeader>
              <CardTitle>User Management</CardTitle>
              <CardDescription>
                View and manage all registered users
              </CardDescription>
            </CardHeader>
            <CardContent>
              {allUsers && allUsers.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Username</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Joined</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {allUsers.map(user => (
                      <TableRow key={user.id}>
                        <TableCell>
                          <div className="flex items-center">
                            <Avatar className="h-10 w-10 mr-3">
                              <AvatarImage 
                                src={user.profileImageUrl || undefined} 
                                alt={user.username} 
                              />
                              <AvatarFallback>
                                {user.username.substring(0, 2).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                          </div>
                        </TableCell>
                        <TableCell className="font-medium">{user.username}</TableCell>
                        <TableCell>{user.email || 'N/A'}</TableCell>
                        <TableCell>{new Date(user.createdAt).toLocaleDateString()}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="text-center py-8 border rounded-lg">
                  <p className="text-gray-500">No users found</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}