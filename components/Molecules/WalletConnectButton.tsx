"use client"

import { useState } from 'react';
import { Button } from '@components/ui/button';
import { ChevronDown } from 'lucide-react';
import { Icon } from '../Atoms/Icon';

export default function WalletConnectButton() {
  const [loggedIn, setLoggedIn] = useState(false);

  return (
    <div className="flex flex-row items-center gap-3">
      <Button
        variant="primary"
        size="md"
        onClick={() => setLoggedIn(!loggedIn)}
      >
        {loggedIn ? 'Deposit' : 'Connect'}
      </Button>
      {loggedIn && (
        <Button variant="neutral" size="md">
          0x....45
          <Icon icon={ChevronDown} />
        </Button>
      )}
    </div>
  );
}
