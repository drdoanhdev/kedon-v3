import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables in test-auth.js')
}

const supabase = createClient(supabaseUrl, supabaseAnonKey)

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' })
  }

  const { action, email, password } = req.body

  try {
    switch (action) {
      case 'test_connection':
        const { data: session, error: sessionError } = await supabase.auth.getSession()
        return res.status(200).json({ 
          success: true, 
          message: 'Kết nối OK',
          session: session ? 'Có session' : 'Không có session',
          error: sessionError
        })

      case 'create_user':
        const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
        })
        
        if (signUpError) {
          return res.status(400).json({ 
            success: false, 
            message: signUpError.message,
            code: signUpError.status
          })
        }
        
        return res.status(200).json({ 
          success: true, 
          message: 'Tạo user thành công',
          user: signUpData.user
        })

      case 'sign_in':
        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        })
        
        if (signInError) {
          return res.status(400).json({ 
            success: false, 
            message: signInError.message,
            code: signInError.status
          })
        }
        
        return res.status(200).json({ 
          success: true, 
          message: 'Đăng nhập thành công',
          user: signInData.user
        })

      default:
        return res.status(400).json({ message: 'Invalid action' })
    }
  } catch (error) {
    console.error('API Error:', error)
    return res.status(500).json({ 
      success: false, 
      message: 'Server error',
      error: error.message 
    })
  }
}
