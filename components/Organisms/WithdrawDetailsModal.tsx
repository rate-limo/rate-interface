'use client';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
  DialogTrigger,
} from '@/components/ui/dialog';
import type { ReactNode } from 'react';
import { WithdrawDetailsModalHeader } from '../Molecules/WithdrawDetailsModalHeader';
import { WithdrawDetailsModalContent } from '../Molecules/WithdrawDetailsModalContent';
import { TransactionType } from '@/data/samples';

interface WithdrawalDetailsModalProps {
  amount: number;
  date: Date;
  address: string;
  estimatedTime: number;
  type?: TransactionType;
  withdrawalStatus?: "Processing" | "Success" | "Failed";
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: ReactNode;
  defaultOpen?: boolean;
}

export function WithdrawalDetailsModal({
  amount,
  date,
  address,
  estimatedTime,
  open,
  onOpenChange,
  trigger,
  defaultOpen,
  type = "Withdrawn",
  withdrawalStatus = "Processing",
}: WithdrawalDetailsModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} defaultOpen={defaultOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}

      <DialogContent className="bg-neutral-dark-default border-neutral-light-white-12 w-[402px] max-w-[402px] border p-0 gap-0 rounded-3xl shadow-none">
        <DialogHeader className="border-neutral-light-white-12 w-full border-b p-4">
          <div className="flex w-full items-center gap-2">
            <DialogTitle className="w-full ">
              <WithdrawDetailsModalHeader
                withdrawalStatus={withdrawalStatus}
                onClose={onOpenChange && (() => onOpenChange(false))}
                type={type}
              />
            </DialogTitle>
          </div>
        </DialogHeader>

        <div className="p-4 border-b  border-neutral-light-white-12 ">
          <WithdrawDetailsModalContent
            amount={amount}
            address={address}
            date={date}
            estimatedTime={estimatedTime}
            withdrawalStatus={withdrawalStatus}
          />
        </div>

        <div className="p-4">
          <DialogClose asChild>
            <Button
              size="lg"
              className="w-full bg-purple-400 py-4 font-medium text-on-primary hover:bg-purple-500"
            >
              Close
            </Button>
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
}
