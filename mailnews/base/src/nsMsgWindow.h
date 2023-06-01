/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef _nsMsgWindow_h
#define _nsMsgWindow_h

#include "nsIMsgWindow.h"
#include "nsIMsgStatusFeedback.h"
#include "nsITransactionManager.h"
#include "nsIMsgFolder.h"
#include "nsCOMPtr.h"
#include "nsIDocShell.h"
#include "nsIURIContentListener.h"
#include "nsWeakReference.h"
#include "nsIWeakReferenceUtils.h"
#include "nsIInterfaceRequestor.h"

class nsMsgWindow : public nsIMsgWindow,
                    public nsIURIContentListener,
                    public nsSupportsWeakReference {
 public:
  NS_DECL_THREADSAFE_ISUPPORTS

  nsMsgWindow();
  nsresult Init();
  NS_DECL_NSIMSGWINDOW
  NS_DECL_NSIURICONTENTLISTENER

 protected:
  virtual ~nsMsgWindow();
  nsCOMPtr<nsIMsgStatusFeedback> mStatusFeedback;
  nsCOMPtr<nsITransactionManager> mTransactionManager;
  nsCOMPtr<nsIMsgFolder> mOpenFolder;
  // These are used by the backend protocol code to attach
  // notification callbacks to channels, e.g., nsIBadCertListner2.
  nsCOMPtr<nsIInterfaceRequestor> mNotificationCallbacks;
  // authorization prompt used during testing only
  nsCOMPtr<nsIAuthPrompt> mAuthPrompt;

  // let's not make this a strong ref - we don't own it.
  nsWeakPtr mRootDocShellWeak;
  nsWeakPtr mMessageWindowDocShellWeak;
  nsWeakPtr mDomWindow;

  nsCString mMailCharacterSet;
  bool mCharsetOverride;
  bool m_stopped;
};

#endif
