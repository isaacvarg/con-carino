import { HiOutlineExternalLink } from 'react-icons/hi'

const FEEDBACK_URL = 'https://feedback.isaacvargas.dev'

type ComingSoonFeedbackProps = {
  title: string
  description: string
}

export default function ComingSoonFeedback({
  title,
  description,
}: ComingSoonFeedbackProps) {
  return (
    <div className="card bg-base-100 shadow-sm">
      <div className="card-body gap-6">
        <div>
          <h2 className="card-title">{title}</h2>
          <p className="mt-1 text-base-content/60">{description}</p>
        </div>
        <div className="flex flex-col gap-2">
          <a
            href={FEEDBACK_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-primary btn-lg h-16 w-full gap-3 text-lg"
          >
            Tell me what you want
            <HiOutlineExternalLink className="size-6" aria-hidden />
          </a>
          <p className="text-center text-sm text-base-content/60">
            Give me some feedback on how you would like this feature to work and
            look so we can improve the app!
          </p>
        </div>
      </div>
    </div>
  )
}
