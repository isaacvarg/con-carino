import { Link } from '@tanstack/react-router'
import type { UserListItem } from '#/server/users'

function initials(user: UserListItem): string {
  const label = user.name?.trim() || user.email?.trim() || '?'
  return label
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

export function UsersTable({ users }: { users: UserListItem[] }) {
  if (users.length === 0) {
    return (
      <p className="text-sm text-base-content/60">
        No users yet. The first person to sign in becomes an admin.
      </p>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="table">
        <thead>
          <tr>
            <th>User</th>
            <th>Email</th>
            <th>Care person</th>
            <th>Sessions</th>
            <th>Role</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr key={user.id} className="hover">
              <td>
                <Link
                  to="/settings/users/$userId"
                  params={{ userId: user.id }}
                  className="flex items-center gap-3 hover:underline"
                >
                  <div className="avatar">
                    <div className="w-9 rounded-full bg-primary text-primary-content">
                      {user.imageUrl ? (
                        <img src={user.imageUrl} alt="" />
                      ) : (
                        <span className="flex size-full items-center justify-center text-xs font-semibold">
                          {initials(user)}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="font-medium">
                    {user.name?.trim() || 'Unnamed'}
                  </span>
                </Link>
              </td>
              <td className="text-sm text-base-content/70">
                {user.email ?? '—'}
              </td>
              <td className="text-sm">{user.carePersonName ?? '—'}</td>
              <td className="text-sm">{user.sessionCount}</td>
              <td>
                {user.isAdmin ? (
                  <span className="badge badge-primary badge-sm">Admin</span>
                ) : (
                  <span className="badge badge-ghost badge-sm">User</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
