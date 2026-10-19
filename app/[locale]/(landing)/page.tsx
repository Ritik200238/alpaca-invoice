'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import {
  Zap,
  Globe,
  ArrowRight,
  CheckCircle,
  Eye,
  EyeOff,
  Database,
  Briefcase,
  AlertTriangle,
  Sparkles,
  FileText,
  Cpu,
  Key,
  ShieldCheck,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Marquee } from '@/components/ui/marquee';
import InvoiceCard from '@/components/invoice-card';
import ReceiptCard from '@/components/receipt-card';
import type { Invoice } from '@/lib/types';
import { InvoiceStatus } from '@/lib/types';

/** Mock receipts for landing page demo (How section step 3) — ReceiptItem shape for ReceiptCard */
const MOCK_RECEIPT_BUYER = {
  paymentId: 'pay_0x7f3a2b1c_field' as any,
  invoiceId: 'inv_0xpaydemo1a2b3c_field' as any,
  payer: 'aleo1buyer1234567890abcdefghijklmnopqrstuvwxyz1234567890ab' as any,
  payee: 'aleo1seller1234567890abcdefghijklmnopqrstuvwxyz1234567890abc' as any,
  amount: BigInt(1_250_000_000),
  paidAt: new Date(),
};

const MOCK_RECEIPT_SELLER = {
  paymentId: 'pay_0x7f3a2b1c_field' as any,
  invoiceId: 'inv_0xpaydemo1a2b3c_field' as any,
  payer: 'aleo1buyer1234567890abcdefghijklmnopqrstuvwxyz1234567890ab' as any,
  payee: 'aleo1seller1234567890abcdefghijklmnopqrstuvwxyz1234567890abc' as any,
  amount: BigInt(1_250_000_000),
  paidAt: new Date(),
};

/** Mock invoices for hero marquee */
const MOCK_INVOICES_HERO: Invoice[] = [
  {
    id: 'inv_0x1a2b3c4d5e6f' as any,
    seller: 'aleo1seller1234567890abcdefghijklmnopqrstuvwxyz1234567890abc',
    buyer: 'aleo1buyer1234567890abcdefghijklmnopqrstuvwxyz1234567890ab',
    amount: BigInt(500_000_000),
    invoiceHash: '0xhash1a2b3c4d5e' as any,
    dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    createdAt: new Date(),
    status: InvoiceStatus.PENDING,
  },
  {
    id: 'inv_0x7f8e9d0c1b2a' as any,
    seller: 'aleo1seller9876543210zyxwvutsrqponmlkjihgfedcba9876543210',
    buyer: 'aleo1buyer9876543210zyxwvutsrqponmlkjihgfedcba9876543210',
    amount: BigInt(1_250_000_000),
    invoiceHash: '0xhash7f8e9d0c1b' as any,
    dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    createdAt: new Date(),
    status: InvoiceStatus.PAID,
  },
  {
    id: 'inv_0x3d4e5f6a7b8c' as any,
    seller: 'aleo1sellerabcdef1234567890ghijklmnopqrstuvwxyz12345678',
    buyer: 'aleo1buyerabcdef1234567890ghijklmnopqrstuvwxyz12345678',
    amount: BigInt(750_000_000),
    invoiceHash: '0xhash3d4e5f6a7b' as any,
    dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
    createdAt: new Date(),
    status: InvoiceStatus.PENDING,
  },
];

/** Single mock invoice for How section step 2 (buyer pays) */
const MOCK_INVOICE_PAY: Invoice = {
  id: 'inv_0xpaydemo1a2b3c' as any,
  seller: 'aleo1seller1234567890abcdefghijklmnopqrstuvwxyz1234567890abc',
  buyer: 'aleo1buyer1234567890abcdefghijklmnopqrstuvwxyz1234567890ab',
  amount: BigInt(1_250_000_000),
  invoiceHash: '0xhashpaydemo12' as any,
  dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  createdAt: new Date(),
  status: InvoiceStatus.PENDING,
};

export default function LandingPage() {
  const t = useTranslations();
  const [activeTab, setActiveTab] = useState<'privacy' | 'transparency'>('privacy');
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 50);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const steps = [
    {
      icon: <FileText className="h-8 w-8 text-accent-500" />,
      title: '1. Issue ZK-Invoice',
      description:
        'Seller generates a private InvoiceRecord. Details like amount and buyer address are encrypted on-chain, visible only to authorized parties.',
      tag: 'transition create_invoice',
    },
    {
      icon: <Cpu className="h-8 w-8 text-primary-500" />,
      title: '2. Private Settlement',
      description:
        'Buyer settles using Aleo credits. The payment receipt is cryptographically linked to the invoice, updating status to PAID privately.',
      tag: 'transition pay_invoice_credits_private',
    },
    {
      icon: <ShieldCheck className="h-8 w-8 text-green-500" />,
      title: '3. Dual-Receipt Generation',
      description:
        'Seller calls create_seller_receipt to generate a mirrored PaymentRecord. Both parties now hold immutable, private proof of settlement.',
      tag: 'transition create_seller_receipt',
    },
  ];

  return (
    <div className="min-h-screen bg-primary-950 text-primary-200 overflow-x-hidden relative selection:bg-accent-500/30">
      {/* Global Noise Texture */}
      <div className="fixed inset-0 bg-noise z-[100] pointer-events-none" />

      {/* Navigation */}
      <nav
        className={`fixed left-0 right-0 z-50 w-full transition-all duration-300 ${
          isScrolled ? 'border-b border-primary-800 bg-primary-950/80 py-3 backdrop-blur-md' : 'bg-transparent py-4'
        }`}
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6">
          <div className="flex items-center space-x-2">
            <div className="relative h-10 w-10 flex-shrink-0 overflow-hidden rounded-xl shadow-lg shadow-accent-900/20">
              <Image
                src="/images/mascot/mascot-celebrating.png"
                alt="ZK-Invoice mascot"
                fill
                className="object-contain"
                sizes="40px"
              />
            </div>
            <span className="bg-gradient-to-r from-white to-primary-400 bg-clip-text text-xl font-bold tracking-tight text-transparent">
              ZK-Invoice
            </span>
          </div>
          <div className="hidden space-x-8 text-sm font-medium text-primary-400 md:flex">
            <a href="#how-it-works" className="transition-colors hover:text-accent-400">
              {t('landing.nav.howItWorks')}
            </a>
            <a href="#features" className="transition-colors hover:text-accent-400">
              {t('landing.nav.features')}
            </a>
            <a href="#why" className="transition-colors hover:text-accent-400">
              {t('landing.nav.why')}
            </a>
          </div>
          <Link
            href="/invoices/create"
            className="rounded-full bg-accent-600 px-6 py-2.5 text-sm font-bold text-white shadow-lg shadow-accent-900/40 transition-all hover:bg-accent-500 active:scale-95"
          >
            {t('landing.nav.startPrivateSettlement')}
          </Link>
        </div>
      </nav>

      {/* Hero Section — left-right layout */}
      <section className="relative overflow-hidden pt-24 pb-10 md:pt-32 md:pb-20">
        <div className="absolute left-1/2 top-0 -z-10 h-full w-full -translate-x-1/2">
          <div className="absolute left-[-10%] top-[-10%] h-[60%] w-[60%] rounded-full bg-accent-600/15 blur-[140px] animate-pulse" />
          <div className="absolute bottom-[10%] right-[-5%] h-[50%] w-[50%] rounded-full bg-primary-600/15 blur-[140px]" />
        </div>

        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="grid w-full grid-cols-[minmax(0,1fr)] items-center gap-10 sm:gap-12 lg:grid-cols-[1fr_360px] lg:gap-10 xl:grid-cols-[1fr_480px] xl:gap-14">
            {/* Left: headline + CTA */}
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              className="relative z-10"
            >
              <div className="mb-6 sm:mb-8 flex flex-wrap justify-start gap-2 sm:gap-3">
                <div className="inline-flex items-center space-x-2 rounded-full border border-accent-500/20 bg-accent-500/10 px-3 py-1 sm:px-4 sm:py-1.5 animate-shiny">
                  <Sparkles className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-accent-400 flex-shrink-0" />
                  <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-[0.1em] sm:tracking-[0.15em] text-accent-400">
                    {t('landing.hero.poweredByAleo')}
                  </span>
                </div>
                <div className="inline-flex items-center space-x-2 rounded-full border border-green-500/20 bg-green-500/10 px-3 py-1 sm:px-4 sm:py-1.5">
                  <ShieldCheck className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-green-400 flex-shrink-0" />
                  <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-[0.1em] sm:tracking-[0.15em] text-green-400">
                    {t('landing.hero.auditFriendly')}
                  </span>
                </div>
              </div>
              <h1 className="mb-4 sm:mb-6 md:mb-8 w-full">
                <motion.span
                  initial={{ opacity: 0, y: 20, filter: "blur(10px)" }}
                  animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  transition={{ duration: 0.8, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
                  className="block whitespace-nowrap bg-gradient-to-r from-accent-400 via-white to-amber-600 bg-clip-text text-transparent italic font-black tracking-tighter
                             text-[clamp(1.75rem,6vw+0.5rem,8rem)] leading-[1.1]
                             animate-title-shimmer animate-title-glow"
                >
                  {t('landing.hero.invisibleInvoicing')}
                </motion.span>
                <motion.span
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.8, delay: 0.4 }}
                  className="block text-2xl font-black leading-[1.2] tracking-tight sm:text-3xl sm:leading-[1.15] md:text-5xl md:leading-[1.1] md:tracking-tighter lg:text-6xl xl:text-7xl 2xl:text-8xl bg-gradient-to-b from-white to-white/70 bg-clip-text text-transparent drop-shadow-sm"
                >
                  {t('landing.hero.settleGlobalTrades')}
                </motion.span>
              </h1>

              <p className="mb-5 sm:mb-8 md:mb-10 w-full max-w-full break-words text-xs font-medium leading-normal text-primary-400/80 sm:text-sm sm:leading-relaxed md:text-base lg:text-lg xl:text-xl">
                {t('landing.hero.bodyText')}
              </p>

              <div className="mb-5 sm:mb-8 md:mb-10 flex flex-wrap gap-3 sm:gap-4 md:gap-6 text-[9px] sm:text-[10px] md:text-xs font-bold uppercase tracking-[0.1em] sm:tracking-[0.15em] md:tracking-[0.2em] text-primary-500">
                <div className="flex items-center gap-2 group cursor-default">
                  <Globe className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-accent-500 transition-transform group-hover:rotate-12" />
                  {t('landing.hero.globalImporters')}
                </div>
                <div className="flex items-center gap-2 group cursor-default">
                  <Briefcase className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-accent-500 transition-transform group-hover:-rotate-12" />
                  {t('landing.hero.supplyChainManagers')}
                </div>
                <div className="flex items-center gap-2 group cursor-default">
                  <Database className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-accent-500 transition-transform group-hover:scale-110" />
                  {t('landing.hero.b2bWholesalers')}
                </div>
              </div>

              <Link
                href="/invoices/create"
                className="group relative inline-flex w-auto min-w-0 items-center justify-center gap-2 whitespace-nowrap rounded-full bg-accent-600 py-3 px-6 text-xs font-black text-white shadow-xl transition-all hover:scale-[1.05] hover:bg-accent-500 active:scale-95 sm:w-auto sm:px-8 sm:py-4 sm:text-base md:px-10 md:py-5 lg:gap-3 lg:px-12 lg:py-6 lg:text-lg xl:text-xl 2xl:text-2xl animate-cta-pulse animate-shiny"
              >
                <span className="relative z-10">{t('landing.hero.createFirstInvoice')}</span>
                <ArrowRight className="relative z-10 h-4 w-4 shrink-0 transition-transform group-hover:translate-x-2 sm:h-5 sm:w-5 md:h-6 md:w-6 lg:h-7 lg:w-7" />
                <div className="absolute inset-0 rounded-full border-2 border-white/20 transition-all group-hover:border-white/40 group-hover:scale-105 pointer-events-none" />
              </Link>
            </motion.div>

            {/* Right: vertical marquee with invoice cards — 3D Perspective */}
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 1, delay: 0.2 }}
              className="relative z-0 h-auto w-full [perspective:1500px] lg:h-[700px]"
            >
              {/* Marquee: horizontal on mobile/tablet, vertical on desktop */}
              {/* Mobile/tablet: horizontal scroll */}
              <div className="relative h-[340px] w-full overflow-hidden lg:hidden">
                <Marquee pauseOnHover className="h-full [--duration:25s]">
                  {MOCK_INVOICES_HERO.map((inv, idx) => (
                    <div key={`h-${inv.invoiceHash}-${idx}`} className="w-[300px] flex-shrink-0 sm:w-[340px]">
                      <InvoiceCard invoice={inv} role="BUYER" onPay={() => {}} />
                    </div>
                  ))}
                </Marquee>
                <div className="pointer-events-none absolute inset-y-0 left-0 w-1/4 bg-gradient-to-r from-primary-950 to-transparent" />
                <div className="pointer-events-none absolute inset-y-0 right-0 w-1/4 bg-gradient-to-l from-primary-950 to-transparent" />
              </div>
              {/* Desktop: vertical scroll with 3D tilt */}
              <div 
                className="relative hidden h-full w-full overflow-hidden lg:block"
                style={{ transform: "rotateY(-15deg) rotateX(5deg)" }}
              >
                <Marquee pauseOnHover vertical className="h-full [--duration:30s]">
                  {MOCK_INVOICES_HERO.map((inv, idx) => (
                    <div key={`v-${inv.invoiceHash}-${idx}`} className="mb-8 w-[340px] xl:w-[420px] flex-shrink-0 transition-all hover:scale-105">
                      <InvoiceCard invoice={inv} role="BUYER" onPay={() => {}} />
                    </div>
                  ))}
                </Marquee>
                <div className="pointer-events-none absolute inset-x-0 top-0 h-1/3 bg-gradient-to-b from-primary-950 via-primary-950/50 to-transparent" />
                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-primary-950 via-primary-950/50 to-transparent" />
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Why Section: Risk Analysis */}
      <section id="why" className="bg-primary-950 py-12 md:py-32 relative">
        <div className="absolute top-1/2 left-0 w-full h-px bg-gradient-to-r from-transparent via-primary-800 to-transparent" />
        
        <div className="mx-auto max-w-7xl px-4 md:px-6 relative">
          <div className="grid items-center gap-12 lg:gap-20 lg:grid-cols-2">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
            >
              <h2 className="mb-8 text-4xl font-black leading-[1] italic tracking-tight md:text-7xl md:tracking-tighter">
                {t('landing.why.headingPrefix')} <span className="text-red-500 underline decoration-red-500/40 decoration-8 underline-offset-[12px]">{t('landing.why.headingHighlight')}</span> {t('landing.why.headingSuffix')}
              </h2>
              <p className="mb-10 text-xl font-medium leading-relaxed text-primary-400 md:text-2xl">
                {t('landing.why.description')}
              </p>

              <div className="space-y-6 md:space-y-8">
                {[
                  {
                    title: t('landing.why.item1Title'),
                    desc: t('landing.why.item1Desc'),
                  },
                  {
                    title: t('landing.why.item2Title'),
                    desc: t('landing.why.item2Desc'),
                  },
                  {
                    title: t('landing.why.item3Title'),
                    desc: t('landing.why.item3Desc'),
                  },
                ].map((item, i) => (
                  <div key={i} className="flex items-start space-x-4 md:space-x-5 group">
                    <div className="rounded-full bg-accent-500/10 p-2 transition-colors group-hover:bg-accent-500/20">
                      <CheckCircle className="h-6 w-6 md:h-7 md:w-7 flex-shrink-0 text-accent-500" />
                    </div>
                    <div>
                      <h4 className="text-lg md:text-xl font-black uppercase tracking-wider text-primary-100">{item.title}</h4>
                      <p className="text-base md:text-lg font-medium text-primary-500">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>

            <motion.div 
              initial={{ opacity: 0, x: 30 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="rounded-[2.5rem] md:rounded-[3rem] border border-white/5 bg-white/[0.02] p-6 md:p-12 shadow-2xl backdrop-blur-xl relative overflow-hidden group"
            >
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-accent-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              
              <div className="mb-12 flex rounded-2xl bg-primary-950/50 p-2 border border-white/5">
                <button
                  type="button"
                  onClick={() => setActiveTab('transparency')}
                  className={`flex flex-1 items-center justify-center gap-3 rounded-xl px-6 py-5 text-sm font-black uppercase tracking-[0.2em] transition-all ${
                    activeTab === 'transparency'
                      ? 'border border-red-500/30 bg-red-500/10 text-red-500 shadow-[0_0_20px_rgba(239,68,68,0.2)]'
                      : 'text-primary-500 hover:text-primary-400'
                  }`}
                >
                  <Eye className="h-5 w-5 flex-shrink-0" />
                  {t('landing.why.competitorAlert')}
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('privacy')}
                  className={`flex flex-1 items-center justify-center gap-3 rounded-xl px-6 py-5 text-sm font-black uppercase tracking-[0.2em] transition-all ${
                    activeTab === 'privacy' 
                      ? 'bg-accent-600 text-white shadow-[0_10px_30px_rgba(245,158,11,0.3)]' 
                      : 'text-primary-500 hover:text-primary-400'
                  }`}
                >
                  <EyeOff className="h-5 w-5 flex-shrink-0" />
                  {t('landing.why.zkShielded')}
                </button>
              </div>

              <div className="h-64 font-mono text-sm relative">
                <AnimatePresence mode="wait">
                  {activeTab === 'transparency' ? (
                    <motion.div 
                      key="transparency"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="space-y-6"
                    >
                      <div className="flex items-center gap-3 font-bold text-red-500 text-lg">
                        <AlertTriangle className="h-6 w-6 animate-bounce" /> {t('landing.why.leakDetected')}
                      </div>
                      <div className="space-y-4 rounded-3xl border border-red-500/20 bg-red-500/5 p-8">
                        <div className="flex justify-between border-b border-red-500/10 pb-4">
                          <span className="tracking-widest uppercase text-primary-500 font-bold">{t('landing.why.payload')}</span>
                          <span className="font-black text-red-500">{t('landing.why.unencrypted')}</span>
                        </div>
                        <div className="space-y-3 text-base">
                          <div className="flex justify-between">
                            <span className="text-primary-400">{t('landing.why.supplier')}</span>
                            <span className="font-bold text-red-400 underline decoration-red-500/30 underline-offset-4">Cheap_Factory_B.eth</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-primary-400">{t('landing.why.netAmount')}</span>
                            <span className="text-white font-black">$1,200,000 USD</span>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  ) : (
                    <motion.div 
                      key="privacy"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="space-y-6"
                    >
                      <div className="flex items-center gap-3 font-bold text-accent-400 text-lg">
                        <CheckCircle className="h-6 w-6" /> {t('landing.why.zkProofVerified')}
                      </div>
                      <div className="space-y-4 rounded-3xl border border-accent-500/20 bg-accent-500/5 p-8">
                        <div className="flex justify-between border-b border-accent-500/10 pb-4">
                          <span className="tracking-widest uppercase text-primary-500 font-bold">{t('landing.why.state')}</span>
                          <span className="font-black text-accent-400">{t('landing.why.encryptedRecord')}</span>
                        </div>
                        <div className="space-y-3 text-base">
                          <div className="flex justify-between">
                            <span className="text-primary-400">{t('landing.why.hash')}</span>
                            <span className="w-48 truncate text-accent-200">at1v...p0x9z...k8l2m...q4n1</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-primary-400">{t('landing.why.parties')}</span>
                            <span className="italic text-primary-300 font-medium">{t('landing.why.hiddenViaSNARK')}</span>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Unfair Advantage: Comparison table */}
      <section id="comparison" className="mx-auto max-w-7xl px-4 md:px-6 py-20 md:py-32">
        <div className="mb-16 md:mb-24 text-center">
          <h2 className="mb-6 text-5xl font-black uppercase italic tracking-tighter md:text-8xl">
            {t('landing.features.thePrefix')} <span className="text-accent-500 drop-shadow-[0_0_20px_rgba(245,158,11,0.2)]">{t('landing.features.unfair')}</span> {t('landing.features.advantage')}
          </h2>
          <p className="text-lg md:text-xl font-bold uppercase tracking-[0.2em] md:tracking-[0.3em] text-primary-500">
            {t('landing.features.unfairAdvantageSubtitle')}
          </p>
        </div>

        <div className="overflow-hidden rounded-[2.5rem] md:rounded-[3.5rem] border border-white/5 bg-white/[0.01] shadow-2xl backdrop-blur-sm relative group">
          {/* Mobile Scroll Hint */}
          <div className="absolute right-0 top-0 bottom-0 w-12 bg-gradient-to-l from-primary-950 to-transparent z-10 pointer-events-none md:hidden" />
          
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] md:min-w-[800px] text-left border-collapse">
              <thead>
                <tr className="bg-white/[0.03]">
                  <th className="px-6 md:px-10 py-8 md:py-10 font-black uppercase tracking-widest text-primary-500 text-xs md:text-sm">{t('landing.features.featureColumn')}</th>
                  <th className="px-6 md:px-10 py-8 md:py-10 font-black uppercase tracking-widest text-primary-400 text-xs md:text-sm">
                    {t('landing.features.legacyBanks')}
                  </th>
                  <th className="px-6 md:px-10 py-8 md:py-10 font-black uppercase tracking-widest text-red-500/80 text-xs md:text-sm">
                    {t('landing.features.publicChains')}
                  </th>
                  <th className="px-6 md:px-10 py-8 md:py-10 font-black italic uppercase tracking-widest text-accent-400 text-xs md:text-sm relative">
                    {t('landing.features.zkInvoiceAleo')}
                    <div className="absolute inset-0 border-x border-accent-500/20 bg-accent-500/5 -z-10" />
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-sm md:text-base font-bold">
                {[
                  { f: t('landing.features.supplyChainPrivacy'), b: t('landing.features.bankKnowsAll'), e: t('landing.features.fullyPublic'), z: t('landing.features.peerToPeer') },
                  { f: t('landing.features.settlementSpeed'), b: t('landing.features.threeToFiveDays'), e: t('landing.features.minutes'), z: t('landing.features.seconds') },
                  { f: t('landing.features.transactionFee'), b: t('landing.features.hiddenFees'), e: t('landing.features.volatileGas'), z: t('landing.features.stableFee') },
                  { f: t('landing.features.auditCompliance'), b: t('landing.features.manualSlow'), e: t('landing.features.impossiblePrivacy'), z: t('landing.features.selectiveViewKeys') },
                  { f: t('landing.features.tradeSecretRisk'), b: t('landing.features.moderate'), e: t('landing.features.critical'), z: t('landing.features.zero') },
                ].map((row, i) => (
                  <tr key={i} className="transition-all hover:bg-white/[0.02] group">
                    <td className="px-6 md:px-10 py-8 md:py-10 text-primary-300 group-hover:text-white transition-colors">{row.f}</td>
                    <td className="px-6 md:px-10 py-8 md:py-10 text-primary-500">{row.b}</td>
                    <td className="px-6 md:px-10 py-8 md:py-10 text-red-500/40 group-hover:text-red-500/60 transition-colors">{row.e}</td>
                    <td className="px-6 md:px-10 py-8 md:py-10 text-accent-400 relative font-black">
                      {row.z}
                      <div className="absolute inset-0 border-x border-accent-500/10 bg-accent-500/[0.02] -z-10" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* How it Works Section — 3 steps with UI demos */}
      <section id="how-it-works" className="bg-primary-900/10 py-32 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_50%_50%,rgba(245,158,11,0.03),transparent_70%)]" />
        
        <div className="mx-auto max-w-7xl px-6 relative">
          <div className="mb-24 text-center">
            <h2 className="mb-6 text-5xl font-black tracking-tighter italic md:text-8xl">
              {t('landing.howItWorks.titlePrefix')} <span className="text-accent-500">{t('landing.howItWorks.titleHighlight')}</span> {t('landing.howItWorks.titleSuffix')}
            </h2>
            <p className="text-xl font-bold uppercase tracking-[0.3em] text-primary-500">
              {t('landing.howItWorks.subtitle')}
            </p>
          </div>

          <div className="grid gap-12 lg:grid-cols-3 relative">
            {/* Connection Lines (Desktop) */}
            <div className="hidden lg:block absolute top-[15%] left-[25%] right-[25%] h-px bg-gradient-to-r from-transparent via-accent-500/20 to-transparent z-0" />
            
            {/* Step 1: Seller creates invoice — mock invoice form UI */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="rounded-[3rem] border border-white/5 bg-white/[0.02] p-8 transition-all hover:bg-white/[0.04] hover:border-accent-500/30 group relative z-10"
            >
              <div className="mb-8 flex h-20 w-20 items-center justify-center rounded-[2rem] bg-primary-900 shadow-[inset_0_2px_10px_rgba(0,0,0,0.5)] group-hover:scale-110 transition-transform">
                <FileText className="h-10 w-10 text-accent-500" />
              </div>
              <h3 className="mb-4 text-2xl font-black uppercase tracking-tight text-white">{t('landing.howItWorks.step1Title')}</h3>
              <p className="mb-8 text-lg font-medium leading-relaxed text-primary-400">
                {t('landing.howItWorks.step1Desc')}
              </p>
              <div className="surface-card space-y-4 rounded-[2rem] border border-white/10 bg-white/5 p-6 text-primary-900 backdrop-blur-md">
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-widest text-primary-400">{t('landing.howItWorks.seller')}</label>
                  <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 font-mono text-xs text-primary-200">
                    aleo1seller...90abc
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-widest text-primary-400">{t('landing.howItWorks.buyer')}</label>
                  <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 font-mono text-xs text-primary-200">
                    aleo1buyer...90ab
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-widest text-primary-400">{t('landing.howItWorks.amount')}</label>
                    <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-primary-100 font-bold">
                      1,250 credits
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-widest text-primary-400">{t('landing.howItWorks.due')}</label>
                    <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-primary-100 font-bold">
                      Dec 15
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  className="w-full cursor-default rounded-xl bg-accent-500 py-4 text-sm font-black uppercase tracking-widest text-white shadow-lg shadow-accent-500/20"
                >
                  {t('landing.howItWorks.createInvoiceBtn')}
                </button>
              </div>
              <div className="mt-6 inline-block rounded-full border border-primary-800 bg-primary-900/50 px-5 py-2 font-mono text-xs text-accent-400">
                transition create_invoice
              </div>
            </motion.div>

            {/* Step 2: Buyer pays — invoice card with Pay button */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
              className="rounded-[3rem] border border-white/5 bg-white/[0.02] p-8 transition-all hover:bg-white/[0.04] hover:border-accent-500/30 group relative z-10"
            >
              <div className="mb-8 flex h-20 w-20 items-center justify-center rounded-[2rem] bg-primary-900 shadow-[inset_0_2px_10px_rgba(0,0,0,0.5)] group-hover:scale-110 transition-transform">
                <Cpu className="h-10 w-10 text-primary-400" />
              </div>
              <h3 className="mb-4 text-2xl font-black uppercase tracking-tight text-white">{t('landing.howItWorks.step2Title')}</h3>
              <p className="mb-8 text-lg font-medium leading-relaxed text-primary-400">
                {t('landing.howItWorks.step2Desc')}
              </p>
              <div className="scale-[1.02] transform drop-shadow-2xl">
                <InvoiceCard invoice={MOCK_INVOICE_PAY} role="BUYER" onPay={() => {}} />
              </div>
              <div className="mt-6 inline-block rounded-full border border-primary-800 bg-primary-900/50 px-5 py-2 font-mono text-xs text-accent-400">
                transition pay_invoice_credits_private
              </div>
            </motion.div>

            {/* Step 3: Both receive receipts */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2 }}
              className="rounded-[3rem] border border-white/5 bg-white/[0.02] p-8 transition-all hover:bg-white/[0.04] hover:border-accent-500/30 group relative z-10"
            >
              <div className="mb-8 flex h-20 w-20 items-center justify-center rounded-[2rem] bg-primary-900 shadow-[inset_0_2px_10px_rgba(0,0,0,0.5)] group-hover:scale-110 transition-transform">
                <ShieldCheck className="h-10 w-10 text-green-500" />
              </div>
              <h3 className="mb-4 text-2xl font-black uppercase tracking-tight text-white">{t('landing.howItWorks.step3Title')}</h3>
              <p className="mb-8 text-lg font-medium leading-relaxed text-primary-400">
                {t('landing.howItWorks.step3Desc')}
              </p>
              <div className="space-y-6">
                <div className="transform -rotate-2 hover:rotate-0 transition-transform">
                  <ReceiptCard receipt={MOCK_RECEIPT_BUYER} />
                </div>
                <div className="transform rotate-2 hover:rotate-0 transition-transform">
                  <ReceiptCard receipt={MOCK_RECEIPT_SELLER} />
                </div>
              </div>
              <div className="mt-6 inline-block rounded-full border border-primary-800 bg-primary-900/50 px-5 py-2 font-mono text-xs text-accent-400">
                transition create_seller_receipt
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* What Section: Core Features — Bento Grid */}
      <section id="features" className="bg-primary-950 py-32 relative overflow-hidden">
        <div className="mx-auto max-w-7xl px-6 relative">
          <div className="mb-24 text-center">
            <h2 className="mb-6 text-5xl font-black uppercase tracking-tighter italic md:text-8xl">
              {t('landing.features.whatIsPrefix')} <span className="text-accent-500">{t('landing.features.whatIsHighlight')}</span>
            </h2>
            <p className="text-xl font-bold uppercase tracking-[0.3em] text-primary-500">
              {t('landing.features.whatIsSubtitle')}
            </p>
          </div>

          <div className="grid gap-8 md:grid-cols-6 md:grid-rows-2 h-auto md:h-[600px]">
            {/* Feature 1: Large Bento Item */}
            <motion.div 
              whileHover={{ y: -5 }}
              className="md:col-span-3 md:row-span-2 rounded-[3rem] border border-white/5 bg-gradient-to-br from-white/[0.03] to-transparent p-12 flex flex-col justify-between group"
            >
              <div>
                <div className="mb-8 flex h-16 w-16 items-center justify-center rounded-2xl bg-accent-500/10 group-hover:bg-accent-500/20 transition-colors">
                  <EyeOff className="h-8 w-8 text-accent-500" />
                </div>
                <h3 className="mb-4 text-3xl font-black uppercase tracking-tight text-white">{t('landing.features.zkRecordInvoicing')}</h3>
                <p className="mb-6 text-sm font-bold uppercase tracking-[0.2em] text-primary-500">{t('landing.features.coreTechnology')}</p>
                <div className="mb-8 h-px bg-gradient-to-r from-primary-800 to-transparent" />
                <p className="text-xl font-medium leading-relaxed text-primary-300">
                  <span className="mb-2 block text-xs font-black uppercase text-accent-400">{t('landing.features.theBenefit')}</span>
                  {t('landing.features.zkRecordBenefitDesc')}
                </p>
              </div>
              <div className="mt-8 p-6 rounded-2xl bg-primary-900/30 border border-white/5 font-mono text-xs text-primary-500">
                <span>{t('landing.features.encryptedPayloadExample')}</span>
                <br />
                {`{ ciphertext: "0x7f3a...2b1c", iv: "0x1a2b...3c4d" }`}
              </div>
            </motion.div>

            {/* Feature 2: Medium Bento Item */}
            <motion.div 
              whileHover={{ y: -5 }}
              className="md:col-span-3 md:row-span-1 rounded-[3rem] border border-white/5 bg-gradient-to-br from-white/[0.03] to-transparent p-10 flex flex-col justify-center group"
            >
              <div className="flex items-center gap-6">
                <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-2xl bg-green-500/10 group-hover:bg-green-500/20 transition-colors">
                  <Zap className="h-8 w-8 text-green-500" />
                </div>
                <div>
                  <h3 className="mb-2 text-2xl font-black uppercase tracking-tight text-white">{t('landing.features.atomicPayments')}</h3>
                  <p className="text-sm font-medium leading-relaxed text-primary-400">
                    <span className="font-black text-green-400 mr-2">{t('landing.features.atomicity')}</span>
                    {t('landing.features.atomicDesc')}
                  </p>
                </div>
              </div>
            </motion.div>

            {/* Feature 3: Medium Bento Item */}
            <motion.div 
              whileHover={{ y: -5 }}
              className="md:col-span-3 md:row-span-1 rounded-[3rem] border border-white/5 bg-gradient-to-br from-white/[0.03] to-transparent p-10 flex flex-col justify-center group"
            >
              <div className="flex items-center gap-6">
                <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-2xl bg-primary-500/10 group-hover:bg-primary-500/20 transition-colors">
                  <Key className="h-8 w-8 text-primary-400" />
                </div>
                <div>
                  <h3 className="mb-2 text-2xl font-black uppercase tracking-tight text-white">{t('landing.features.selectiveDisclosure')}</h3>
                  <p className="text-sm font-medium leading-relaxed text-primary-400">
                    <span className="font-black text-primary-400 mr-2">{t('landing.features.compliance')}</span>
                    {t('landing.features.selectiveDisclosureDesc')}
                  </p>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-7xl px-6 py-32 text-center">
        <div className="relative overflow-hidden rounded-[4rem] bg-gradient-to-br from-accent-700 to-primary-900 p-12 shadow-2xl md:p-24">
          <div className="absolute inset-0 bg-primary-950/20" />
          <h2 className="relative z-10 mb-8 text-5xl font-black leading-none italic tracking-tighter text-white md:text-8xl">
            {t('landing.cta.heading1')}
            <br />
            {t('landing.cta.heading2')}
          </h2>
          <div className="relative z-10 flex flex-col items-center gap-6">
            <Link
              href="/invoices/create"
              className="rounded-full bg-white px-12 py-6 text-2xl font-black text-accent-700 shadow-2xl transition-all hover:scale-105 active:scale-95"
            >
              {t('landing.cta.button')}
            </Link>
            <p className="text-sm font-bold uppercase tracking-widest text-accent-200/60">
              {t('landing.cta.securedBy')}
            </p>
          </div>
        </div>
      </section>

      <footer className="mx-auto max-w-7xl border-t border-primary-900 px-6 py-16 text-center font-medium text-primary-600">
        <div className="mb-8 flex items-center justify-center space-x-2">
          <div className="relative h-10 w-10 flex-shrink-0 opacity-80">
            <Image
              src="/images/mascot/mascot-celebrating.png"
              alt="ZK-Invoice mascot"
              fill
              className="object-contain"
              sizes="40px"
            />
          </div>
          <span className="text-2xl font-black tracking-tighter text-primary-400">ZK-Invoice</span>
        </div>
        <p>{t('landing.footer.copyright')}</p>
      </footer>
    </div>
  );
}
