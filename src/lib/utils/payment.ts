import crypto from 'crypto';
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { Database } from "@/types/database.types";

export function generatePayHereHash(
  merchantId: string,
  orderId: string | number,
  amount: string | number,
  currency: string,
  merchantSecret: string
): string {
  // Format amount to 2 decimal places if it's a number
  const formattedAmount = typeof amount === 'number' 
    ? amount.toFixed(2)
    : amount;

  // First hash the merchant secret
  const hashedSecret = crypto.createHash('md5')
    .update(merchantSecret)
    .digest('hex')
    .toUpperCase();

  // Create hash string according to PayHere specification
  const hashString = `${merchantId}${orderId}${formattedAmount}${currency}${hashedSecret}`;
  
  // Generate final hash
  return crypto.createHash('md5')
    .update(hashString)
    .digest('hex')
    .toUpperCase();
}

export function validatePayHereNotification(
  merchantId: string,
  orderId: string,
  amount: string,
  currency: string,
  statusCode: string,
  receivedHash: string,
  merchantSecret: string
): boolean {
  const hashedSecret = crypto.createHash('md5')
    .update(merchantSecret)
    .digest('hex')
    .toUpperCase();

  const hashString = merchantId + 
    orderId + 
    amount + 
    currency + 
    statusCode + 
    hashedSecret;

  const calculatedHash = crypto.createHash('md5')
    .update(hashString)
    .digest('hex')
    .toUpperCase();

  return calculatedHash === receivedHash;
}

export async function getPaymentEnvironmentVariables() {
  const merchantSecret = process.env.PAYHERE_MERCHANT_SECRET;
  const merchantId = process.env.PAYHERE_MERCHANT_ID;
  const notifyUrl = process.env.PAYHERE_NOTIFY_URL;
  const returnUrl = process.env.NEXT_PUBLIC_PAYHERE_RETURN_URL;
  const cancelUrl = process.env.NEXT_PUBLIC_PAYHERE_CANCEL_URL;

  if (!merchantSecret || !merchantId || !notifyUrl || !returnUrl || !cancelUrl) {
    throw new Error("Payment gateway configuration error");
  }

  return {
    merchantSecret,
    merchantId,
    notifyUrl,
    returnUrl,
    cancelUrl
  };
}

export async function validateTaskOwnership(taskId: number) {
  const supabase = createServerComponentClient<Database>({ cookies });
  
  const { data, error } = await supabase
    .rpc('is_it_my_task', { task_id_input: taskId });

  if (error) throw error;
  return data;
}

export async function updatePaymentStatus(
  taskId: number,
  paymentDetails: {
    is_paid: boolean;
    payment_method: Database['public']['Enums']['PaymentMethod'];
    paid_at?: string;
    metadata?: any;
  }
) {
  const supabase = createServerComponentClient<Database>({ cookies });

  // Update task cost
  const { error: costError } = await supabase
    .from('task_cost')
    .update(paymentDetails)
    .eq('task_id', taskId);

  if (costError) throw costError;

  // Update task status to ACTIVE if payment is successful
  if (paymentDetails.is_paid) {
    const { error: taskError } = await supabase
      .from('tasks')
      .update({ status: 'ACTIVE' })
      .eq('id', taskId);

    if (taskError) throw taskError;
  }
}